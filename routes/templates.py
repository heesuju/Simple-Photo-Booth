import os
import uuid
import cv2
import aiofiles
from fastapi import APIRouter, Request, HTTPException, File, UploadFile
from fastapi.responses import JSONResponse
from utils.template_generation import generate_layout_thumbnail, generate_template_if_not_exists
from utils.common import gcd

router = APIRouter()

UPLOAD_DIR = "static/uploads"
GENERATED_TEMPLATES_DIR = "static/generated_templates"


@router.get("/layouts")
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


@router.get("/templates_by_layout")
async def get_templates_by_layout(request: Request, aspect_ratio: str, cell_layout: str):
    templates = request.app.state.db_manager.get_templates_by_layout(aspect_ratio, cell_layout)
    return JSONResponse(content=templates)


@router.post("/upload_template")
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


@router.post("/save_template")
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
    generate_template_if_not_exists(db_manager, aspect_ratio, cell_layout, GENERATED_TEMPLATES_DIR)

    return JSONResponse(content={"message": "Template saved successfully"})
