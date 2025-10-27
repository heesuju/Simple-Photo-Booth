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
import random
from urllib.parse import quote
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from zipfile import ZipFile
from io import BytesIO
from starlette.responses import StreamingResponse
from rembg import remove
from PIL import Image, ImageDraw, ImageFont
import io
import asyncio
import httpx

import moviepy.editor as mpe

from db_manager import DatabaseManager

from dotenv import load_dotenv

load_dotenv()

VIDEOS_DIR = "static/videos"

def gcd(a, b):
    while b:
        a, b = b, a % b
    return a


# --- App and DB Configuration ---
PORT = 8000
DATABASE = 'photobooth.db'
UPLOAD_DIR = "static/uploads"
STICKERS_DIR = "static/stickers" # New directory for stickers
FONTS_DIR = "static/fonts"
RESULTS_DIR = "static/results"
GENERATED_TEMPLATES_DIR = "static/generated_templates"


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

def generate_default_templates(db_manager):
    layouts = {
        "2:3": ["1x1"],
        "3:4": ["1x3"],
        "4:3": ["1x4"],
        "4:5": ["2x2"],
        "1:1": ["3x2"]
    }

    for ar_str, layout_list in layouts.items():
        for layout_str in layout_list:
            generate_template_if_not_exists(db_manager, ar_str, layout_str)

def generate_template_if_not_exists(db_manager, ar_str, layout_str):
    # Check if a an existing DEFAULT template with this combination already exists
    if db_manager.get_default_template_by_layout(ar_str, layout_str):
        print(f"Default template for {ar_str} {layout_str} already exists. Skipping.")
        return

    print(f"Generating template for {ar_str} {layout_str}...")

    try:
        ar_w, ar_h = map(int, ar_str.split(':'))
        cols, rows = map(int, layout_str.split('x'))

        base_photo_w = 480
        base_photo_h = int(base_photo_w * ar_h / ar_w)
        gap = 30
        bottom_padding = 150

        template_w = (base_photo_w * cols) + (gap * (cols + 1))
        template_h = (base_photo_h * rows) + (gap * (rows + 1)) + bottom_padding

        # Create a 4-channel image (BGRA) initialized to white
        template = np.full((template_h, template_w, 4), (255, 255, 255, 255), np.uint8)

        holes = []
        for r in range(rows):
            for c in range(cols):
                x = gap + c * (base_photo_w + gap)
                y = gap + r * (base_photo_h + gap)
                # Set the hole area to be transparent
                template[y:y+base_photo_h, x:x+base_photo_w, 3] = 0
                holes.append({"x": x, "y": y, "w": base_photo_w, "h": base_photo_h})

        # Save the generated template
        filename = f"template_{ar_str.replace(':', '_')}_{layout_str}.png"
        file_path = os.path.join(GENERATED_TEMPLATES_DIR, filename)
        cv2.imwrite(file_path, template)

        # Add to database
        template_path_for_db = f"/{file_path}"
        hole_count = len(holes)
        transformations = [{'scale': 1, 'rotation': 0} for _ in holes]
        db_manager.add_template(template_path_for_db, hole_count, holes, ar_str, layout_str, transformations, is_default=True)

        # Generate the layout thumbnail
        generate_layout_thumbnail(ar_str, layout_str, "static/layouts")

        print(f"Successfully generated and saved template for {ar_str} {layout_str}.")

    except Exception as e:
        print(f"Error generating template for {ar_str} {layout_str}: {e}")

# --- Lifespan Management (Startup/Shutdown) ---
def rotate_image(image, angle):
    (h, w) = image.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    cos = np.abs(M[0, 0])
    sin = np.abs(M[0, 1])
    new_w = int((h * sin) + (w * cos))
    new_h = int((h * cos) + (w * sin))
    M[0, 2] += (new_w / 2) - center[0]
    M[1, 2] += (new_h / 2) - center[1]
    return cv2.warpAffine(image, M, (new_w, new_h))

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db_manager = DatabaseManager(DATABASE)
    app.state.db_manager.init_db()
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(STICKERS_DIR, exist_ok=True) # Create stickers dir
    os.makedirs(FONTS_DIR, exist_ok=True)
    os.makedirs(RESULTS_DIR, exist_ok=True)
    os.makedirs(GENERATED_TEMPLATES_DIR, exist_ok=True)
    os.makedirs(VIDEOS_DIR, exist_ok=True)

    # --- Sync Stickers with DB ---
    db_manager = app.state.db_manager
    
    generate_default_templates(db_manager)

    existing_stickers = {s['sticker_path'] for s in db_manager.get_all_stickers()}
    
    for filename in os.listdir(STICKERS_DIR):
        sticker_path = f"/{STICKERS_DIR}/{filename}"
        if sticker_path not in existing_stickers:
            db_manager.add_sticker(sticker_path)
            print(f"Added new sticker to DB: {sticker_path}")

    # --- Sync Fonts with DB ---
    existing_fonts = {f['font_path'] for f in db_manager.get_all_fonts()}
    for filename in os.listdir(FONTS_DIR):
        font_path = f"/{FONTS_DIR}/{filename}"
        if font_path not in existing_fonts:
            font_name = os.path.splitext(filename)[0]
            db_manager.add_font(font_name, font_path)
            print(f"Added new font to DB: {font_name}")

    populate_default_colors(db_manager)
    db_manager.populate_default_filter_presets()

    yield

app = FastAPI(lifespan=lifespan)

def populate_default_colors(db_manager):
    default_colors = ['#FFFFFF', '#000000', '#FFDDC1', '#FFABAB', '#FFC3A0', '#B5EAD7', '#C7CEEA']
    for color in default_colors:
        db_manager.add_color(color)

# --- Static Files and Root HTML ---
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
@app.get("/layouts")
async def get_layouts(request: Request):
    layouts = request.app.state.db_manager.get_layouts()
    
    # Create a directory for generated layout thumbnails if it doesn't exist
    layout_thumbnail_dir = "static/layouts"
    os.makedirs(layout_thumbnail_dir, exist_ok=True)

    for layout in layouts:
        thumbnail_path = generate_layout_thumbnail(layout['aspect_ratio'], layout['cell_layout'], layout_thumbnail_dir)
        layout['thumbnail_path'] = thumbnail_path
        
        # Find a template that matches the layout to get the holes info
        template = request.app.state.db_manager.get_template_by_layout(layout['aspect_ratio'], layout['cell_layout'])
        if template:
            layout['template_path'] = template['template_path']
            layout['holes'] = template['holes']
            layout['hole_count'] = template['hole_count']
            layout['transformations'] = template.get('transformations', [])
            layout['is_default'] = template.get('is_default', False)
        else:
            # Handle case where no matching template is found, though this should ideally not happen
            layout['template_path'] = None
            layout['holes'] = []
            layout['hole_count'] = 0
            layout['transformations'] = []

    return JSONResponse(content=layouts)

def generate_layout_thumbnail(aspect_ratio, cell_layout, output_dir):
    # Generate a unique filename for the thumbnail
    filename = f"{aspect_ratio.replace(':', '_')}_{cell_layout}.png"
    thumbnail_path = os.path.join(output_dir, filename)
    
    # Check if the thumbnail already exists
    if os.path.exists(thumbnail_path):
        return f"/{thumbnail_path}"

    # Parse aspect ratio and cell layout
    try:
        ar_w, ar_h = map(int, aspect_ratio.split(':'))
        cols, rows = map(int, cell_layout.split('x'))
    except ValueError:
        return None

    # Define cell dimensions based on aspect ratio
    cell_base_dim = 100
    cell_w = cell_base_dim
    cell_h = int(cell_base_dim * ar_h / ar_w)

    # Define image dimensions based on cell layout and dimensions
    gap = 10
    img_w = (cell_w * cols) + (gap * (cols + 1))
    img_h = (cell_h * rows) + (gap * (rows + 1))

    # Create a white canvas
    canvas = np.full((img_h, img_w, 3), (255, 255, 255), np.uint8)

    # Define pastel colors
    pastel_colors = [
        (255, 204, 204),  # Light Pink
        (204, 229, 255),  # Light Blue
        (204, 255, 204),  # Light Green
        (255, 229, 204),  # Light Orange
        (229, 204, 255),  # Light Purple
        (255, 255, 204)   # Light Yellow
    ]

    # Load placeholder images
    placeholder_dir = "static/placeholder"
    person_images = [
        cv2.imread(os.path.join(placeholder_dir, "person1.png"), cv2.IMREAD_UNCHANGED),
        cv2.imread(os.path.join(placeholder_dir, "person2.png"), cv2.IMREAD_UNCHANGED)
    ]

    # Draw the grid with person images
    offset = random.randint(0, len(pastel_colors) - 1)

    for r in range(rows):
        for c in range(cols):
            x = gap + c * (cell_w + gap)
            y = gap + r * (cell_h + gap)
            
            # Create a cell with a pastel color background        
            cell_bg_color = pastel_colors[(r * cols + c + offset) % len(pastel_colors)]
            cell_bg = np.full((cell_h, cell_w, 3), cell_bg_color, np.uint8)

            # Place the cell background onto the canvas
            canvas[y:y + cell_h, x:x + cell_w] = cell_bg

            # Cycle through person images
            person_img = person_images[(r * cols + c) % len(person_images)]
            
            # Resize and crop person image to fit the cell
            person_h, person_w, _ = person_img.shape
            
            # Maintain aspect ratio
            scale = max(cell_w / person_w, cell_h / person_h)
            new_w, new_h = int(person_w * scale), int(person_h * scale)
            resized_person = cv2.resize(person_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
            
            # Crop the center of the resized image
            crop_x = (new_w - cell_w) // 2
            crop_y = (new_h - cell_h) // 2
            
            cropped_person = resized_person[crop_y:crop_y + cell_h, crop_x:crop_x + cell_w]
            
            # Overlay the person image onto the cell background
            # Alpha blending
            alpha_person = cropped_person[:, :, 3] / 255.0
            alpha_canvas = 1.0 - alpha_person

            for i in range(3):
                canvas[y:y+cell_h, x:x+cell_w, i] = (alpha_person * cropped_person[:,:,i] + alpha_canvas * canvas[y:y+cell_h, x:x+cell_w, i])

    # Save the generated image
    cv2.imwrite(thumbnail_path, canvas)
    return f"/{thumbnail_path}"

@app.get("/templates_by_layout")
async def get_templates_by_layout(request: Request, aspect_ratio: str, cell_layout: str):
    templates = request.app.state.db_manager.get_templates_by_layout(aspect_ratio, cell_layout)
    # No need to manually decode JSON here if the db_manager does it
    return JSONResponse(content=templates)

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
            if w < 5 or h < 5:
                continue
            holes.append({"x": x, "y": y, "w": w, "h": h})
        
        if not holes:
            raise ValueError("No holes found in the template.")

        # --- Calculate Aspect Ratio and Cell Layout ---
        # Sort holes by position (top-to-bottom, then left-to-right)
        holes.sort(key=lambda h: (h['y'], h['x']))

        # Find the largest hole to determine the aspect ratio
        largest_hole = max(holes, key=lambda h: h['w'] * h['h'])
        w = largest_hole['w']
        h = largest_hole['h']
        common_divisor = gcd(w, h)
        aspect_ratio = f"{w // common_divisor}:{h // common_divisor}"

        # Determine cell layout (e.g., 4x1, 2x2)
        rows = {}
        for hole in holes:
            # Group holes by their y-coordinate (allowing for some tolerance)
            found_row = False
            for row_y in rows:
                if abs(hole['y'] - row_y) < 20: # 20px tolerance
                    rows[row_y].append(hole)
                    found_row = True
                    break
            if not found_row:
                rows[hole['y']] = [hole]
        
        num_rows = len(rows)
        # Assuming a somewhat consistent number of columns per row for simple layouts
        num_cols = round(len(holes) / num_rows) if num_rows > 0 else 0
        cell_layout = f"{num_cols}x{num_rows}"

        # Initialize transformations with default values
        transformations = [{'scale': 1, 'rotation': 0} for _ in holes]

        return JSONResponse(content={
            "template_path": f"/{file_path}",
            "hole_count": len(holes),
            "holes": holes,
            "aspect_ratio": aspect_ratio,
            "cell_layout": cell_layout,
            "transformations": transformations
        })
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Error processing image: {e}")

@app.post("/save_template")
async def save_template(request: Request):
    data = await request.json()
    template_path = data.get('template_path')
    hole_count = data.get('hole_count')
    holes = data.get('holes')
    aspect_ratio = data.get('aspect_ratio')
    cell_layout = data.get('cell_layout')
    transformations = data.get('transformations')

    db_manager = request.app.state.db_manager
    db_manager.add_template(template_path, hole_count, holes, aspect_ratio, cell_layout, transformations, is_default=False)

    # Ensure a default version of this new layout exists
    generate_template_if_not_exists(db_manager, aspect_ratio, cell_layout)

    return JSONResponse(content={"message": "Template saved successfully"})

@app.get("/colors")
async def get_colors(request: Request):
    colors = request.app.state.db_manager.get_all_colors()
    return JSONResponse(content=colors)

@app.post("/add_color")
async def add_color(request: Request):
    data = await request.json()
    hex_code = data.get('hex_code')
    if not hex_code:
        raise HTTPException(status_code=400, detail="Hex code not provided.")
    
    db_manager = request.app.state.db_manager
    db_manager.add_color(hex_code)
    
    return JSONResponse(content={"message": "Color added successfully"})

@app.get("/styles")
async def get_styles(request: Request):
    styles = request.app.state.db_manager.get_all_styles()
    return JSONResponse(content=styles)

@app.post("/add_style")
async def add_style(request: Request):
    data = await request.json()
    name = data.get('name')
    prompt = data.get('prompt')
    if not name or not prompt:
        raise HTTPException(status_code=400, detail="Name and prompt are required.")
    
    db_manager = request.app.state.db_manager
    db_manager.add_style(name, prompt)
    
    return JSONResponse(content={"message": "Style added successfully"})

@app.delete("/styles")
async def delete_style(request: Request, style_id: int):
    try:
        db_manager = request.app.state.db_manager
        db_manager.delete_style(style_id)
        return Response(status_code=204)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete style: {e}")

@app.put("/styles/{style_id}")
async def update_style(request: Request, style_id: int):
    try:
        data = await request.json()
        name = data.get("name")
        prompt = data.get("prompt")
        db_manager = request.app.state.db_manager
        db_manager.update_style(style_id, name, prompt)
        return JSONResponse(content={"message": "Style updated successfully"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update style: {e}")

@app.get("/filter_presets")
async def get_filter_presets(request: Request):
    presets = request.app.state.db_manager.get_all_filter_presets()
    return JSONResponse(content=presets)

@app.post("/filter_presets")
async def add_filter_preset(request: Request):
    data = await request.json()
    name = data.get("name")
    filter_values = data.get("filter_values")
    if not name or not filter_values:
        raise HTTPException(status_code=400, detail="Name and values are required.")
    
    db_manager = request.app.state.db_manager
    db_manager.add_filter_preset(name, filter_values)
    
    return JSONResponse(content={"message": "Filter preset added successfully"})

@app.post("/zip_originals")
async def zip_originals(photos: List[UploadFile] = File(...)):
    zip_filename = f"{uuid.uuid4()}.zip"
    zip_path = os.path.join(RESULTS_DIR, zip_filename)

    with ZipFile(zip_path, 'w') as zf:
        for i, photo_file in enumerate(photos):
            content = await photo_file.read()
            zf.writestr(f"photo_{i+1}.jpg", content)

    ip_address = get_ip_address()
    full_url = f"http://{ip_address}:{PORT}/static/results/{zip_filename}"
    qr_img = qrcode.make(full_url)
    qr_filename = f"qr_{uuid.uuid4()}.png"
    qr_path = os.path.join(RESULTS_DIR, qr_filename)
    qr_img.save(qr_path)

    return JSONResponse(content={
        "result_path": f"/static/results/{zip_filename}",
        "qr_code_path": f"/static/results/{qr_filename}"
    })

@app.post("/apply_filters_to_image")
async def apply_filters_to_image(file: UploadFile = File(...), filters: str = Form(...)):
    try:
        filter_data = json.loads(filters)
        photo_content = await file.read()
        nparr = np.frombuffer(photo_content, np.uint8)
        photo_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        filtered_photo = apply_filters(photo_img, filter_data)
        
        _, encoded_img = cv2.imencode('.PNG', filtered_photo)
        return StreamingResponse(io.BytesIO(encoded_img.tobytes()), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to apply filters: {e}")

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

@app.get("/fonts")
async def get_fonts(request: Request):
    return JSONResponse(content=request.app.state.db_manager.get_all_fonts())

@app.post("/upload_font")
async def upload_font(request: Request, file: UploadFile = File(...)):
    allowed_extensions = {'.ttf', '.otf', '.woff', '.woff2'}
    file_extension = os.path.splitext(file.filename)[1].lower()

    if file.content_type not in ['font/ttf', 'font/otf', 'font/woff', 'font/woff2', 'application/octet-stream'] or file_extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Please upload a valid font file.")

    db_manager = request.app.state.db_manager
    font_name = os.path.splitext(file.filename)[0]
    if db_manager.get_font_by_name(font_name):
        raise HTTPException(status_code=409, detail=f"Font with name '{font_name}' already exists.")

    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(FONTS_DIR, unique_filename)

    try:
        async with aiofiles.open(file_path, 'wb') as out_file:
            content = await file.read()
            await out_file.write(content)
        
        db_manager = request.app.state.db_manager
        font_name = os.path.splitext(file.filename)[0]
        db_manager.add_font(font_name, f"/{file_path}")
        return JSONResponse(content={"font_path": f"/{file_path}"}, status_code=201)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading font: {e}")

def apply_filters(image, filters):
    brightness = int(filters.get('brightness', 100))
    contrast = int(filters.get('contrast', 100))
    saturate = int(filters.get('saturate', 100))
    warmth = int(filters.get('warmth', 100))
    sharpness = int(filters.get('sharpness', 0))
    blur = int(filters.get('blur', 0))
    grain = int(filters.get('grain', 0))

    # --- Brightness & Contrast ---
    img_float = image.astype(np.float32)
    brightness_factor = brightness / 100.0
    img_float = img_float * brightness_factor
    contrast_factor = contrast / 100.0
    if contrast_factor != 1.0:
        mean = np.array([128, 128, 128], dtype=np.float32)
        img_float = mean + contrast_factor * (img_float - mean)
    img_float = np.clip(img_float, 0, 255)
    image = img_float.astype(np.uint8)

    # --- Saturation ---
    if saturate != 100:
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV).astype(np.float32)
        h, s, v = cv2.split(hsv)
        saturation_factor = saturate / 100.0
        s = s * saturation_factor
        s = np.clip(s, 0, 255)
        final_hsv = cv2.merge([h, s, v])
        image = cv2.cvtColor(final_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    # --- Warmth ---
    if warmth != 100:
        # Map 0-200 slider to a range of -50 to 50 for adjustment
        warmth_value = (warmth - 100) / 2.0 
        # Split channels
        b, g, r = cv2.split(image.astype(np.float32))
        # Add warmth (increase red, decrease blue)
        r += warmth_value
        b -= warmth_value
        # Clip values
        r = np.clip(r, 0, 255)
        b = np.clip(b, 0, 255)
        image = cv2.merge([b, g, r]).astype(np.uint8)

    # --- Sharpness ---
    if sharpness > 0:
        amount = sharpness / 100.0
        # This kernel matches the SVG filter on the frontend
        kernel = np.array([[0, -amount, 0],
                           [-amount, 1 + 4 * amount, -amount],
                           [0, -amount, 0]])
        # Work with a float image for convolution, then clip and convert back
        float_image = image.astype(np.float32)
        sharpened_float = cv2.filter2D(float_image, -1, kernel)
        image = np.clip(sharpened_float, 0, 255).astype(np.uint8)

    # --- Blur ---
    if blur > 0:
        # The CSS blur() pixel value corresponds to sigma. We pass it directly.
        # Setting kernel size to (0,0) makes OpenCV calculate it from sigma.
        image = cv2.GaussianBlur(image, (0, 0), blur)

    # --- Grain ---
    if grain > 0:
        noise = np.random.normal(0, grain, image.shape).astype(np.int16)
        image = np.clip(image.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    return image

@app.post("/remove_background")
async def remove_background_api(file: UploadFile = File(...)):
    try:
        input_bytes = await file.read()
        output_bytes = remove(input_bytes, model='u2net_human_seg')

        # Create a new image with a white background
        foreground = Image.open(io.BytesIO(output_bytes)).convert("RGBA")
        background = Image.new("RGBA", foreground.size, (255, 255, 255, 255))
        background.paste(foreground, (0, 0), foreground)

        # Convert back to bytes
        img_byte_arr = io.BytesIO()
        background.convert("RGB").save(img_byte_arr, format='JPEG')
        img_byte_arr = img_byte_arr.getvalue()

        return StreamingResponse(io.BytesIO(img_byte_arr), media_type="image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove background: {e}")

@app.post("/process_and_stylize_image")
async def process_and_stylize_image(request: Request, prompt: str = Form(...), file: UploadFile = File(...)):
    api_key = os.getenv("POLLINATIONS_API_KEY")
    headers = {}
    if api_key:
        print("Using Pollinations API Key.")
        headers["Authorization"] = f"Bearer {api_key}"

    max_retries = 3
    direct_link = None

    try:
        # It's important to rewind the file pointer if you are reading it multiple times
        await file.seek(0)
        # Step 1: Upload to tmpfiles.org
        async with httpx.AsyncClient() as client:
            files = {'file': (file.filename, await file.read(), file.content_type)}
            upload_response = await client.post("https://tmpfiles.org/api/v1/upload", files=files, timeout=30.0)
            upload_response.raise_for_status()
            upload_data = upload_response.json()

            if upload_data.get("status") != "success":
                raise HTTPException(status_code=500, detail=f"Failed to upload to temporary storage: {upload_data}")

            temp_url = upload_data["data"]["url"]
            direct_link = temp_url.replace("tmpfiles.org/", "tmpfiles.org/dl/")
            print(f"Temporarily hosted at: {direct_link}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload to temporary storage: {e}")

    for attempt in range(max_retries):
        try:
            # Step 2: Call Pollinations.ai
            encoded_prompt = quote(prompt)
            pollinations_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}"
            params = {
                "model": "kontext",
                "image": direct_link,
                "nologo": True,
                "enhance": True,
                "private": True,
            }
            print(f"Proxying request to: {pollinations_url}")
            print(params)

            async with httpx.AsyncClient() as client:
                stylize_response = await client.get(pollinations_url, headers=headers, params=params, timeout=100.0, follow_redirects=True)
                stylize_response.raise_for_status()

            # Step 3: Stream the final image back
            content_type = stylize_response.headers.get('Content-Type', 'application/octet-stream')
            return StreamingResponse(io.BytesIO(stylize_response.content), media_type=content_type)

        except Exception as e:
            print(f"Attempt {attempt + 1} of {max_retries} failed: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(3)
            else:
                error_message = f"Failed to stylize image after {max_retries} attempts: {e}"
                print(f"Error in /process_and_stylize_image: {error_message}")
                return Response(content=error_message, status_code=500)

def draw_texts(image, texts_data, db_manager):
    if not texts_data:
        return image

    pil_image = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGRA2RGBA))
    draw = ImageDraw.Draw(pil_image)

    for text_info in texts_data:
        font_name = text_info.get('font')
        font_info = db_manager.get_font_by_name(font_name)
        if not font_info:
            print(f"Font '{font_name}' not found in database. Skipping text.")
            continue

        font_path = os.path.join(os.getcwd(), font_info['font_path'].lstrip('/'))
        if not os.path.exists(font_path):
            print(f"Font file not found at '{font_path}'. Skipping text.")
            continue

        text = text_info.get('text', '')
        font_size = int(text_info.get('fontSize', 40))
        x = int(text_info.get('x', 0))
        y = int(text_info.get('y', 0))
        justify = text_info.get('justify', 'left') # Get justification
        
        try:
            font = ImageFont.truetype(font_path, font_size)
        except IOError:
            print(f"Failed to load font '{font_path}'. Skipping text.")
            continue

        # Calculate text width for justification
        bbox = draw.textbbox((0, 0), text, font=font) # Get bounding box
        text_width = bbox[2] - bbox[0]

        if justify == 'center':
            x = x + (text_info.get('width', text_width) - text_width) // 2
        elif justify == 'right':
            x = x + (text_info.get('width', text_width) - text_width)

        draw.text((x, y), text, font=font, fill=(0, 0, 0, 255))

    return cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGBA2BGRA)

@app.post("/compose_image")

async def compose_image(request: Request, holes: str = Form(...), photos: List[UploadFile] = File(...), stickers: str = Form(...), texts: str = Form(None), filters: str = Form(...), transformations: str = Form(...), template_path: str = Form(None), template_file: UploadFile = File(None), remove_background: bool = Form(False)):
    try:
        if template_file:
            # Save the uploaded colored template
            temp_filename = f"{uuid.uuid4()}.png"
            base_template_path = os.path.join(UPLOAD_DIR, temp_filename)
            async with aiofiles.open(base_template_path, 'wb') as out_file:
                content = await template_file.read()
                await out_file.write(content)
        elif template_path:
            # Use the path from the form
            base_template_path = os.path.join(os.getcwd(), template_path.lstrip('/'))
        else:
            raise HTTPException(status_code=400, detail="No template provided.")

        print(f"Received filters: {filters}")
        hole_data = json.loads(holes)
        filter_data = json.loads(filters)
        transform_data = json.loads(transformations)
        template_img = cv2.imread(base_template_path, cv2.IMREAD_UNCHANGED)
        height, width, _ = template_img.shape
        canvas = np.full((height, width, 3), 255, np.uint8)
        for i, photo_file in enumerate(photos):
            hole = hole_data[i]
            transform = transform_data[i]
            photo_content = await photo_file.read()

            if remove_background:
                # Remove background and place on a white canvas
                output_bytes = remove(photo_content, model='u2net_human_seg')
                foreground = Image.open(io.BytesIO(output_bytes)).convert("RGBA")
                background = Image.new("RGBA", foreground.size, (255, 255, 255, 255))
                background.paste(foreground, (0, 0), foreground)
                
                # Convert PIL image back to OpenCV format
                background = background.convert("RGB")
                open_cv_image = np.array(background)
                photo_img = open_cv_image[:, :, ::-1].copy() # Convert RGB to BGR
            else:
                nparr = np.frombuffer(photo_content, np.uint8)
                photo_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            filtered_photo = apply_filters(photo_img, filter_data)

            # Apply transformations
            scale = transform.get('scale', 1)
            rotation = -transform.get('rotation', 0)
            new_w = int(hole['w'] * scale)
            new_h = int(hole['h'] * scale)

            resized_photo = cv2.resize(filtered_photo, (new_w, new_h))
            rotated_photo = rotate_image(resized_photo, rotation)

            # Calculate position for centered placement
            r_h, r_w, _ = rotated_photo.shape
            pos_x = hole['x'] + (hole['w'] - r_w) // 2
            pos_y = hole['y'] + (hole['h'] - r_h) // 2

            # Create a mask from the rotated photo's alpha channel if it exists, otherwise just use the photo
            if rotated_photo.shape[2] == 4:
                alpha_mask = rotated_photo[:, :, 3] / 255.0
                alpha_mask_3c = np.dstack((alpha_mask, alpha_mask, alpha_mask))
                
                # Bounds checking
                x1, y1 = max(pos_x, 0), max(pos_y, 0)
                x2, y2 = min(pos_x + r_w, width), min(pos_y + r_h, height)
                
                w, h = x2 - x1, y2 - y1
                if w > 0 and h > 0:
                    canvas_roi = canvas[y1:y2, x1:x2]
                    photo_roi = rotated_photo[y1-pos_y:y1-pos_y+h, x1-pos_x:x1-pos_x+w, :3]
                    alpha_roi = alpha_mask_3c[y1-pos_y:y1-pos_y+h, x1-pos_x:x1-pos_x+w]

                    canvas[y1:y2, x1:x2] = canvas_roi * (1 - alpha_roi) + photo_roi * alpha_roi
            else:
                # Bounds checking for BGR images
                x1, y1 = max(pos_x, 0), max(pos_y, 0)
                x2, y2 = min(pos_x + r_w, width), min(pos_y + r_h, height)

                w, h = x2 - x1, y2 - y1
                if w > 0 and h > 0:
                    canvas[y1:y2, x1:x2] = rotated_photo[y1-pos_y:y1-pos_y+h, x1-pos_x:x1-pos_x+w]

        template_bgr = template_img[:, :, 0:3]
        alpha_channel = template_img[:, :, 3] / 255.0
        alpha_mask = np.dstack((alpha_channel, alpha_channel, alpha_channel))
        composite_img = ((template_bgr * alpha_mask) + (canvas * (1 - alpha_mask))).astype(np.uint8)

        # --- Sticker Overlay Logic ---
        placed_stickers = json.loads(stickers)
        final_image_bgra = cv2.cvtColor(composite_img, cv2.COLOR_BGR2BGRA)

        for sticker_data in placed_stickers:
            # --- Server-side validation for sticker dimensions ---
            try:
                width = int(sticker_data.get('width'))
                height = int(sticker_data.get('height'))
                if width <= 0 or height <= 0:
                    print(f"Skipping sticker with invalid dimensions: {sticker_data}")
                    continue
            except (ValueError, TypeError):
                print(f"Skipping sticker with non-numeric dimensions: {sticker_data}")
                continue

            sticker_path = os.path.join(os.getcwd(), sticker_data['path'].lstrip('/'))
            if not os.path.exists(sticker_path):
                continue # Skip if sticker image not found

            sticker_img = cv2.imread(sticker_path, cv2.IMREAD_UNCHANGED)
            if sticker_img.shape[2] == 3:
                sticker_img = cv2.cvtColor(sticker_img, cv2.COLOR_BGR2BGRA)
            
            sticker_img_resized = cv2.resize(sticker_img, (width, height))
            sticker_rotated = rotate_image(sticker_img_resized, -sticker_data.get('rotation', 0))
            
            s_h, s_w, _ = sticker_rotated.shape
            pos_x = sticker_data['x'] - (s_w - sticker_data['width']) // 2
            pos_y = sticker_data['y'] - (s_h - sticker_data['height']) // 2
            img_h, img_w, _ = final_image_bgra.shape

            # --- Clipping Logic ---
            # Calculate the intersection of the sticker and the main image
            x1 = int(max(pos_x, 0))
            y1 = int(max(pos_y, 0))
            x2 = int(min(pos_x + s_w, img_w))
            y2 = int(min(pos_y + s_h, img_h))

            # Calculate the width and height of the overlapping area
            w = x2 - x1
            h = y2 - y1

            # If there is no overlap, skip this sticker
            if w <= 0 or h <= 0:
                continue

            # Get the corresponding region from the sticker
            sticker_x1 = 0 if pos_x > 0 else -pos_x
            sticker_y1 = 0 if pos_y > 0 else -pos_y
            clipped_sticker = sticker_rotated[int(sticker_y1):int(sticker_y1+h), int(sticker_x1):int(sticker_x1+w)]

            # Get the region of interest from the main image
            roi = final_image_bgra[y1:y2, x1:x2]

            # Alpha blending for the clipped sticker
            sticker_alpha = clipped_sticker[:, :, 3] / 255.0
            sticker_alpha_mask = np.dstack((sticker_alpha, sticker_alpha, sticker_alpha, sticker_alpha))
            
            blended_roi = (clipped_sticker * sticker_alpha_mask) + (roi * (1 - sticker_alpha_mask))
            final_image_bgra[y1:y2, x1:x2] = blended_roi

        if texts:
            texts_data = json.loads(texts)
            db_manager = request.app.state.db_manager
            final_image_bgra = draw_texts(final_image_bgra, texts_data, db_manager)

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

@app.get("/recent_results")
async def get_recent_results():
    results_files = []
    for filename in os.listdir(RESULTS_DIR):
        if filename.endswith(".png") and 'qr' not in filename:
            file_path = os.path.join(RESULTS_DIR, filename)
            if os.path.isfile(file_path):
                mod_time = os.path.getmtime(file_path)
                results_files.append({"path": f"/{file_path}", "mod_time": mod_time})
    
    # Sort by modification time, newest first
    results_files.sort(key=lambda x: x["mod_time"], reverse=True)
    
    # Get the most recent 5 files
    recent_five = [file["path"] for file in results_files[:5]]
    
    return JSONResponse(content=recent_five)

@app.post("/upload_video_chunk")
async def upload_video_chunk(request: Request, video: UploadFile = File(...)):
    try:
        file_extension = os.path.splitext(video.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(VIDEOS_DIR, unique_filename)

        async with aiofiles.open(file_path, 'wb') as out_file:
            content = await video.read()
            await out_file.write(content)
        
        return JSONResponse(content={"video_path": f"/{file_path}"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload video chunk: {e}")

@app.post("/compose_video")
async def compose_video(request: Request, holes: str = Form(...), video_paths: List[str] = Form(...), stickers: str = Form(...), texts: str = Form(None), transformations: str = Form(...), template_path: str = Form(None), template_file: UploadFile = File(None)):
    try:
        if template_file:
            temp_filename = f"{uuid.uuid4()}.png"
            base_template_path = os.path.join(UPLOAD_DIR, temp_filename)
            async with aiofiles.open(base_template_path, 'wb') as out_file:
                content = await template_file.read()
                await out_file.write(content)
        elif template_path:
            base_template_path = os.path.join(os.getcwd(), template_path.lstrip('/'))
        else:
            raise HTTPException(status_code=400, detail="No template provided.")

        hole_data = json.loads(holes)
        sticker_data = json.loads(stickers)
        transform_data = json.loads(transformations)

        clips = [mpe.VideoFileClip(os.path.join(os.getcwd(), path.lstrip('/'))) for path in video_paths]
        min_duration = min(clip.duration for clip in clips)
        clips = [clip.subclip(clip.duration - min_duration) for clip in clips]

        template_img = cv2.imread(base_template_path, cv2.IMREAD_UNCHANGED)
        height, width, _ = template_img.shape
        background_clip = mpe.ColorClip(size=(width, height), color=(0,0,0), duration=min_duration)

        video_clips = []
        for i, clip in enumerate(clips):
            hole = hole_data[i]
            transform = transform_data[i]

            scale = transform.get('scale', 1)
            rotation = -transform.get('rotation', 0)
            new_w = int(hole['w'] * scale)
            new_h = int(hole['h'] * scale)

            resized_clip = clip.resize((new_w, new_h)).rotate(rotation)
            pos_x = hole['x'] + (hole['w'] - resized_clip.w) // 2
            pos_y = hole['y'] + (hole['h'] - resized_clip.h) // 2

            video_clips.append(resized_clip.set_position((pos_x, pos_y)).set_duration(min_duration))

        template_clip = mpe.ImageClip(base_template_path, transparent=True).set_duration(min_duration)

        sticker_clips = []
        for sticker in sticker_data:
            sticker_path = os.path.join(os.getcwd(), sticker['path'].lstrip('/'))
            sticker_img = mpe.ImageClip(sticker_path, transparent=True).set_duration(min_duration)
            sticker_img = sticker_img.resize((sticker['width'], sticker['height'])).rotate(-sticker.get('rotation', 0))
            sticker_clips.append(sticker_img.set_position((sticker['x'], sticker['y'])))

        text_clips = []
        if texts:
            texts_data = json.loads(texts)
            db_manager = request.app.state.db_manager
            for text_info in texts_data:
                font_name = text_info.get('font')
                font_info = db_manager.get_font_by_name(font_name)
                if not font_info:
                    continue
                font_path = os.path.join(os.getcwd(), font_info['font_path'].lstrip('/'))
                if not os.path.exists(font_path):
                    continue
                
                text = text_info.get('text', '')
                font_size = int(text_info.get('fontSize', 40))
                pos_x = int(text_info.get('x', 0))
                pos_y = int(text_info.get('y', 0))
                justify = text_info.get('justify', 'left')

                try:
                    font = ImageFont.truetype(font_path, font_size)
                except IOError:
                    continue

                bbox = font.getbbox(text)
                text_width = bbox[2] - bbox[0]
                text_height = bbox[3] - bbox[1]

                if justify == 'center':
                    pos_x = pos_x + (text_info.get('width', text_width) - text_width) // 2
                elif justify == 'right':
                    pos_x = pos_x + (text_info.get('width', text_width) - text_width)

                text_img = Image.new('RGBA', (text_width, text_height), (255, 255, 255, 0))
                draw = ImageDraw.Draw(text_img)
                draw.text((0, 0), text, font=font, fill=(0, 0, 0, 255))
                text_np = np.array(text_img)
                text_clip = mpe.ImageClip(text_np).set_duration(min_duration)
                text_clip = text_clip.set_position((pos_x, pos_y))
                text_clips.append(text_clip)

        final_clip = mpe.CompositeVideoClip([background_clip] + video_clips + [template_clip] + sticker_clips + text_clips, size=(width, height))
        result_filename = f"{uuid.uuid4()}.mp4"
        result_path = os.path.join(RESULTS_DIR, result_filename)
        final_clip.write_videofile(result_path, codec="libx264", fps=24)

        # --- QR code generation ---
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
        raise HTTPException(status_code=500, detail=f"Failed to compose video: {e}")

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=False)