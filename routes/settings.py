from fastapi import APIRouter, Request, Form
from fastapi.responses import JSONResponse, HTMLResponse
import aiofiles

router = APIRouter()


@router.get("/", response_class=HTMLResponse)
async def read_root():
    try:
        async with aiofiles.open('templates/index.html', mode='r', encoding='utf-8') as f:
            content = await f.read()
        return HTMLResponse(content=content)
    except FileNotFoundError:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="index.html not found")


@router.post("/set_theme")
async def set_theme(request: Request, theme: str = Form(...)):
    db_manager = request.app.state.db_manager
    db_manager.set_setting('theme', theme)
    request.app.state.current_theme = theme
    return JSONResponse(content={"message": "Theme updated successfully"})


@router.get("/get_theme")
async def get_theme(request: Request):
    theme = request.app.state.current_theme
    return JSONResponse(content={"theme": theme})
