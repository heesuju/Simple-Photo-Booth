from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/colors")
async def get_colors(request: Request):
    colors = request.app.state.db_manager.get_all_colors()
    return JSONResponse(content=colors)


@router.post("/add_color")
async def add_color(request: Request):
    from fastapi import HTTPException
    data = await request.json()
    hex_code = data.get('hex_code')
    if not hex_code:
        raise HTTPException(status_code=400, detail="Hex code not provided.")
    
    db_manager = request.app.state.db_manager
    db_manager.add_color(hex_code)
    
    return JSONResponse(content={"message": "Color added successfully"})
