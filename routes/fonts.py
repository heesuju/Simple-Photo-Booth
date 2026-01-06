from fastapi import APIRouter, Request, HTTPException, File, UploadFile
from fastapi.responses import JSONResponse
import os
import aiofiles

router = APIRouter()

FONTS_DIR = "static/fonts"


@router.get("/fonts")
async def get_fonts(request: Request):
    return JSONResponse(content=request.app.state.db_manager.get_all_fonts())


@router.post("/upload_font")
async def upload_font(request: Request, file: UploadFile = File(...)):
    allowed_extensions = {'.ttf', '.otf', '.woff', '.woff2'}
    file_extension = os.path.splitext(file.filename)[1].lower()

    if file.content_type not in ['font/ttf', 'font/otf', 'font/woff', 'font/woff2', 'application/octet-stream'] or file_extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Please upload a valid font file.")

    db_manager = request.app.state.db_manager
    
    # Sanitize font name to prevent path traversal and ensure valid filename
    original_font_name = os.path.splitext(file.filename)[0]
    sanitized_font_name = "".join(c for c in original_font_name if c.isalnum() or c in (' ', '.', '_', '-')).rstrip()
    
    if not sanitized_font_name:
        raise HTTPException(status_code=400, detail="Invalid font filename.")

    # Check if font with the sanitized name already exists
    if db_manager.get_font_by_name(sanitized_font_name):
        raise HTTPException(status_code=409, detail=f"Font with name '{sanitized_font_name}' already exists.")

    # Use the sanitized font name for the filename
    final_filename = f"{sanitized_font_name}{file_extension}"
    file_path = os.path.join(FONTS_DIR, final_filename)

    try:
        async with aiofiles.open(file_path, 'wb') as out_file:
            content = await file.read()
            await out_file.write(content)
        
        db_manager.add_font(sanitized_font_name, f"/{file_path}")
        return JSONResponse(content={"font_name": sanitized_font_name, "font_path": f"/{file_path}"}, status_code=201)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading font: {e}")
