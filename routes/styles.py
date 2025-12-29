from fastapi import APIRouter, Request, HTTPException, Response
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/styles")
async def get_styles(request: Request):
    styles = request.app.state.db_manager.get_all_styles()
    return JSONResponse(content=styles)


@router.post("/add_style")
async def add_style(request: Request):
    data = await request.json()
    name = data.get('name')
    prompt = data.get('prompt')
    if not name or not prompt:
        raise HTTPException(status_code=400, detail="Name and prompt are required.")
    
    db_manager = request.app.state.db_manager
    db_manager.add_style(name, prompt)
    
    return JSONResponse(content={"message": "Style added successfully"})


@router.delete("/styles")
async def delete_style(request: Request, style_id: int):
    try:
        db_manager = request.app.state.db_manager
        db_manager.delete_style(style_id)
        return Response(status_code=204)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete style: {e}")


@router.put("/styles/{style_id}")
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


@router.get("/filter_presets")
async def get_filter_presets(request: Request):
    presets = request.app.state.db_manager.get_all_filter_presets()
    return JSONResponse(content=presets)


@router.post("/filter_presets")
async def add_filter_preset(request: Request):
    data = await request.json()
    name = data.get("name")
    filter_values = data.get("filter_values")
    if not name or not filter_values:
        raise HTTPException(status_code=400, detail="Name and values are required.")
    
    db_manager = request.app.state.db_manager
    db_manager.add_filter_preset(name, filter_values)
    
    return JSONResponse(content={"message": "Filter preset added successfully"})
