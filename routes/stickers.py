import os
import uuid
import aiofiles
from fastapi import APIRouter, Request, HTTPException, File, UploadFile, Form
from fastapi.responses import JSONResponse

router = APIRouter()

STICKERS_DIR = "static/stickers"


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
        
        db_manager = request.app.state.db_manager
        cat = file_path.replace('\\', '/')
        sticker_path_for_db = f"/{cat}"
        db_manager.add_sticker(sticker_path_for_db, category)
        return JSONResponse(content={"sticker_path": sticker_path_for_db}, status_code=201)
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
