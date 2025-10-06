import os
import uuid
import cv2
import numpy as np
import aiofiles
import uvicorn

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

# Ensure upload and results folders exist
UPLOAD_DIR = "static/uploads"
RESULTS_DIR = "static/results"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # on startup
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(RESULTS_DIR, exist_ok=True)
    yield
    # on shutdown

app = FastAPI(lifespan=lifespan)

# Mount static files directory
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def read_root():
    try:
        async with aiofiles.open('templates/index.html', mode='r', encoding='utf-8') as f:
            content = await f.read()
        return HTMLResponse(content=content)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="index.html not found")

@app.post("/upload_template")
async def upload_template(file: UploadFile = File(...)):
    if not file.content_type == 'image/png':
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a PNG image.")

    # Generate a unique filename
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    # Save the uploaded file
    try:
        async with aiofiles.open(file_path, 'wb') as out_file:
            content = await file.read()
            await out_file.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {e}")

    # Process the image with OpenCV
    try:
        # Read the image with alpha channel
        img = cv2.imread(file_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise HTTPException(status_code=500, detail="Could not read image file.")

        if img.shape[2] < 4:
            return JSONResponse(content={
                "error": "Image does not have an alpha channel for transparency."
            }, status_code=400)

        # Isolate the alpha channel
        alpha_channel = img[:, :, 3]

        # Threshold the alpha channel to get a binary image
        _, thresh = cv2.threshold(alpha_channel, 1, 255, cv2.THRESH_BINARY_INV)

        # Find contours
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        holes = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            holes.append({"x": x, "y": y, "w": w, "h": h})

        return JSONResponse(content={
            "template_path": f"/static/uploads/{unique_filename}",
            "hole_count": len(holes),
            "holes": holes
        })
    except Exception as e:
        # Clean up saved file if processing fails
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Error processing image: {e}")

import json
from typing import List
from fastapi import Form

@app.post("/compose_image")
async def compose_image(
    template_path: str = Form(...),
    holes: str = Form(...),
    photos: List[UploadFile] = File(...)
):
    try:
        hole_data = json.loads(holes)
        
        # Construct the full path for the template on the server
        base_template_path = os.path.join(os.getcwd(), template_path.lstrip('/'))

        if not os.path.exists(base_template_path):
            raise HTTPException(status_code=404, detail="Template file not found on server.")

        # Load the template image
        template_img = cv2.imread(base_template_path, cv2.IMREAD_UNCHANGED)
        if template_img.shape[2] < 4:
            raise HTTPException(status_code=400, detail="Template image does not have an alpha channel.")

        height, width, _ = template_img.shape

        # Create a white canvas to place photos on
        canvas = np.full((height, width, 3), 255, np.uint8)

        if len(hole_data) != len(photos):
            raise HTTPException(status_code=400, detail="Mismatch between number of holes and number of photos.")

        # Place each photo onto the canvas at the location of the hole
        for i, photo_file in enumerate(photos):
            hole = hole_data[i]
            
            photo_content = await photo_file.read()
            nparr = np.frombuffer(photo_content, np.uint8)
            photo_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            resized_photo = cv2.resize(photo_img, (hole['w'], hole['h']))
            canvas[hole['y']:hole['y']+hole['h'], hole['x']:hole['x']+hole['w']] = resized_photo

        # Alpha-blend the original template over the canvas
        template_bgr = template_img[:, :, 0:3]
        alpha_channel = template_img[:, :, 3] / 255.0
        alpha_mask = np.dstack((alpha_channel, alpha_channel, alpha_channel))

        # composite = foreground * alpha + background * (1 - alpha)
        composite_img = (template_bgr * alpha_mask) + (canvas * (1 - alpha_mask))
        composite_img = composite_img.astype(np.uint8)

        # Save the final image
        result_filename = f"{uuid.uuid4()}.png"
        result_path = os.path.join(RESULTS_DIR, result_filename)
        cv2.imwrite(result_path, composite_img)

        return JSONResponse(content={
            "result_path": f"/static/results/{result_filename}"
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compose image: {e}")


if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
