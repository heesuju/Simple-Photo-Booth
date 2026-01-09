import os
import uuid
import aiofiles
from fastapi import APIRouter, Request, HTTPException, File, UploadFile, Form
from fastapi.responses import JSONResponse
from PIL import Image

router = APIRouter()

STICKERS_DIR = "static/stickers"
THUMBNAILS_DIR = "static/stickers/thumbnails"


def generate_thumbnail(source_path, thumbnail_size=(100, 100)):
    """Generate a thumbnail from an image or animated WebP.
    
    Args:
        source_path: Path to the source image
        thumbnail_size: Tuple of (width, height) for the thumbnail
    
    Returns:
        Path to the generated thumbnail, or None if generation fails
    """
    try:
        os.makedirs(THUMBNAILS_DIR, exist_ok=True)
        
        # Open the image (PIL automatically extracts first frame from animated WebP)
        with Image.open(source_path) as img:
            # Convert to RGB if necessary (for PNG output)
            if img.mode in ('RGBA', 'LA', 'P'):
                # Preserve transparency by using RGBA
                img = img.convert('RGBA')
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Create thumbnail (maintains aspect ratio)
            img.thumbnail(thumbnail_size, Image.Resampling.LANCZOS)
            
            # Generate thumbnail filename
            source_basename = os.path.basename(source_path)
            name_without_ext = os.path.splitext(source_basename)[0]
            thumbnail_filename = f"{name_without_ext}_thumb.png"
            thumbnail_path = os.path.join(THUMBNAILS_DIR, thumbnail_filename)
            
            # Save as PNG
            img.save(thumbnail_path, 'PNG', optimize=True)
            
            # Return path with forward slashes for web
            return "/" + thumbnail_path.replace('\\', '/')
            
    except Exception as e:
        print(f"Error generating thumbnail for {source_path}: {e}")
        return None


@router.get("/stickers")
async def get_stickers(request: Request):
    return JSONResponse(content=request.app.state.db_manager.get_all_stickers())


@router.post("/upload_sticker")
async def upload_sticker(request: Request, file: UploadFile = File(...), category: str = Form(None)):
    if not file.content_type in ['image/png', 'image/jpeg']:
        raise HTTPException(status_code=400, detail="Please upload a PNG or JPG image.")

    if category:
        sticker_dir = os.path.join(STICKERS_DIR, category)
        os.makedirs(sticker_dir, exist_ok=True)
    else:
        sticker_dir = STICKERS_DIR

    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(sticker_dir, unique_filename)

    try:
        async with aiofiles.open(file_path, 'wb') as out_file:
            content = await file.read()
            await out_file.write(content)
        
        # Generate thumbnail
        thumbnail_path = generate_thumbnail(file_path)
        
        db_manager = request.app.state.db_manager
        cat = file_path.replace('\\', '/')
        sticker_path_for_db = f"/{cat}"
        db_manager.add_sticker(sticker_path_for_db, category, thumbnail_path)
        return JSONResponse(content={"sticker_path": sticker_path_for_db, "thumbnail_path": thumbnail_path}, status_code=201)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading sticker: {e}")


@router.get("/sticker_categories")
async def get_sticker_categories(request: Request):
    categories = []
    if os.path.exists(STICKERS_DIR):
        for item in os.listdir(STICKERS_DIR):
            if os.path.isdir(os.path.join(STICKERS_DIR, item)):
                categories.append(item)
    return JSONResponse(content=categories)


@router.post("/create_sticker_category")
async def create_sticker_category(request: Request):
    data = await request.json()
    category_name = data.get('name')
    if not category_name:
        raise HTTPException(status_code=400, detail="Category name is required.")

    # Sanitize category name
    sanitized_name = "".join(c for c in category_name if c.isalnum() or c in (' ', '.', '_', '-')).strip()
    if not sanitized_name:
        raise HTTPException(status_code=400, detail="Invalid category name.")

    sticker_dir = os.path.join(STICKERS_DIR, sanitized_name)
    try:
        if os.path.exists(sticker_dir):
             raise HTTPException(status_code=409, detail="Category already exists.")
        os.makedirs(sticker_dir, exist_ok=True)
        return JSONResponse(content={"message": "Category created successfully", "name": sanitized_name}, status_code=201)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Error creating category: {e}")
