import os
import uuid
import cv2
import numpy as np
import aiofiles
import uvicorn
import json
import qrcode
import socket
from typing import List

from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from db_manager import DatabaseManager

# --- App and DB Configuration ---
PORT = 8000
DATABASE = 'photobooth.db'
UPLOAD_DIR = "static/uploads"
STICKERS_DIR = "static/stickers" # New directory for stickers
RESULTS_DIR = "static/results"

# --- Helper Functions (unchanged) ---
def get_ip_address():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

# --- Lifespan Management (Startup/Shutdown) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db_manager = DatabaseManager(DATABASE)
    app.state.db_manager.init_db()
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(STICKERS_DIR, exist_ok=True) # Create stickers dir
    os.makedirs(RESULTS_DIR, exist_ok=True)
    yield

app = FastAPI(lifespan=lifespan)

# --- Static Files and Root HTML (unchanged) ---
app.mount("/static", StaticFiles(directory="static"), name="static")
@app.get("/", response_class=HTMLResponse)
async def read_root():
    try:
        async with aiofiles.open('templates/index.html', mode='r', encoding='utf-8') as f:
            content = await f.read()
        return HTMLResponse(content=content)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="index.html not found")

# --- API Endpoints ---
@app.get("/templates")
async def get_templates(request: Request):
    return JSONResponse(content=request.app.state.db_manager.get_all_templates())

@app.post("/upload_template")
async def upload_template(request: Request, file: UploadFile = File(...)):
    # ... (logic is unchanged)
    pass

@app.get("/stickers")
async def get_stickers(request: Request):
    return JSONResponse(content=request.app.state.db_manager.get_all_stickers())

@app.post("/upload_sticker")
async def upload_sticker(request: Request, file: UploadFile = File(...)):
    if not file.content_type in ['image/png', 'image/jpeg']:
        raise HTTPException(status_code=400, detail="Please upload a PNG or JPG image.")

    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(STICKERS_DIR, unique_filename)

    try:
        async with aiofiles.open(file_path, 'wb') as out_file:
            content = await file.read()
            await out_file.write(content)
        
        db_manager = request.app.state.db_manager
        db_manager.add_sticker(f"/{file_path}")
        return JSONResponse(content={"sticker_path": f"/{file_path}"}, status_code=201)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading sticker: {e}")

@app.post("/compose_image")
async def compose_image(request: Request, template_path: str = Form(...), holes: str = Form(...), photos: List[UploadFile] = File(...), stickers: str = Form(...)):
    # ... (code for photo composition is mostly unchanged)
    # ADDED: sticker overlay logic
    try:
        # ... (photo composition logic as before) ...
        hole_data = json.loads(holes)
        base_template_path = os.path.join(os.getcwd(), template_path.lstrip('/'))
        template_img = cv2.imread(base_template_path, cv2.IMREAD_UNCHANGED)
        height, width, _ = template_img.shape
        canvas = np.full((height, width, 3), 255, np.uint8)
        for i, photo_file in enumerate(photos):
            hole = hole_data[i]
            photo_content = await photo_file.read()
            nparr = np.frombuffer(photo_content, np.uint8)
            photo_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            resized_photo = cv2.resize(photo_img, (hole['w'], hole['h']))
            canvas[hole['y']:hole['y']+hole['h'], hole['x']:hole['x']+hole['w']] = resized_photo
        template_bgr = template_img[:, :, 0:3]
        alpha_channel = template_img[:, :, 3] / 255.0
        alpha_mask = np.dstack((alpha_channel, alpha_channel, alpha_channel))
        composite_img = ((template_bgr * alpha_mask) + (canvas * (1 - alpha_mask))).astype(np.uint8)

        # --- NEW: Sticker Overlay Logic ---
        placed_stickers = json.loads(stickers)
        final_image_bgra = cv2.cvtColor(composite_img, cv2.COLOR_BGR2BGRA)

        for sticker_data in placed_stickers:
            sticker_path = os.path.join(os.getcwd(), sticker_data['path'].lstrip('/'))
            if not os.path.exists(sticker_path):
                continue # Skip if sticker image not found

            sticker_img = cv2.imread(sticker_path, cv2.IMREAD_UNCHANGED)
            if sticker_img.shape[2] == 3:
                sticker_img = cv2.cvtColor(sticker_img, cv2.COLOR_BGR2BGRA)
            
            sticker_img_resized = cv2.resize(sticker_img, (sticker_data['width'], sticker_data['height']))
            
            s_h, s_w, _ = sticker_img_resized.shape
            pos_x, pos_y = sticker_data['x'], sticker_data['y']
            img_h, img_w, _ = final_image_bgra.shape

            # --- Clipping Logic ---
            # Calculate the intersection of the sticker and the main image
            x1 = max(pos_x, 0)
            y1 = max(pos_y, 0)
            x2 = min(pos_x + s_w, img_w)
            y2 = min(pos_y + s_h, img_h)

            # Calculate the width and height of the overlapping area
            w = x2 - x1
            h = y2 - y1

            # If there is no overlap, skip this sticker
            if w <= 0 or h <= 0:
                continue

            # Get the corresponding region from the sticker
            sticker_x1 = 0 if pos_x > 0 else -pos_x
            sticker_y1 = 0 if pos_y > 0 else -pos_y
            clipped_sticker = sticker_img_resized[sticker_y1:sticker_y1+h, sticker_x1:sticker_x1+w]

            # Get the region of interest from the main image
            roi = final_image_bgra[y1:y2, x1:x2]

            # Alpha blending for the clipped sticker
            sticker_alpha = clipped_sticker[:, :, 3] / 255.0
            sticker_alpha_mask = np.dstack((sticker_alpha, sticker_alpha, sticker_alpha, sticker_alpha))
            
            blended_roi = (clipped_sticker * sticker_alpha_mask) + (roi * (1 - sticker_alpha_mask))
            final_image_bgra[y1:y2, x1:x2] = blended_roi

        # --- Save final image and generate QR code ---
        result_filename = f"{uuid.uuid4()}.png"
        result_path = os.path.join(RESULTS_DIR, result_filename)
        cv2.imwrite(result_path, final_image_bgra)

        ip_address = get_ip_address()
        full_url = f"http://{ip_address}:{PORT}/static/results/{result_filename}"
        qr_img = qrcode.make(full_url)
        qr_filename = f"qr_{uuid.uuid4()}.png"
        qr_path = os.path.join(RESULTS_DIR, qr_filename)
        qr_img.save(qr_path)

        return JSONResponse(content={
            "result_path": f"/static/results/{result_filename}",
            "qr_code_path": f"/static/results/{qr_filename}"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compose image: {e}")

# --- Main Execution (unchanged) ---
if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=True)

# Note: Pasting in the unchanged upload_template function for completeness
@app.post("/upload_template")
async def upload_template(request: Request, file: UploadFile = File(...)):
    if not file.content_type == 'image/png':
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a PNG image.")
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    try:
        async with aiofiles.open(file_path, 'wb') as out_file:
            content = await file.read()
            await out_file.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {e}")
    try:
        img = cv2.imread(file_path, cv2.IMREAD_UNCHANGED)
        if img is None or img.shape[2] < 4:
            raise ValueError("Image must be a PNG with an alpha channel.")
        alpha_channel = img[:, :, 3]
        _, thresh = cv2.threshold(alpha_channel, 1, 255, cv2.THRESH_BINARY_INV)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        holes = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            holes.append({"x": x, "y": y, "w": w, "h": h})
        db_manager = request.app.state.db_manager
        db_manager.add_template(f"/{file_path}", len(holes), holes)
        return JSONResponse(content={
            "template_path": f"/{file_path}",
            "hole_count": len(holes),
            "holes": holes
        })
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Error processing image: {e}")
