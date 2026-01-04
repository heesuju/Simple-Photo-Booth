import os
import uuid
import cv2
import numpy as np
import io
import json
import random
import qrcode
import asyncio
import httpx
import aiofiles
import shutil
from typing import List, Optional
from zipfile import ZipFile
from urllib.parse import quote
from PIL import Image
from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Response
from fastapi.responses import JSONResponse, StreamingResponse
from rembg import remove
from utils.common import get_ip_address
from utils.filters import apply_filters
from utils.drawing import draw_texts, draw_texts_on_pil
from utils.image_processing import load_image_with_premultiplied_alpha, rotate_image
from utils.session_manager import session_manager

router = APIRouter()

PORT = 8000
UPLOAD_DIR = "static/uploads"
RESULTS_DIR = "static/results"
SESSIONS_DIR = "static/results/sessions"

# Ensure directories exist
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)
os.makedirs(SESSIONS_DIR, exist_ok=True)


@router.post("/zip_originals")
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


@router.post("/zip_session_originals")
async def zip_session_originals(session_id: str = Form(...)):
    # Verify session exists
    session_data = await session_manager.get_session(session_id)
    if not session_data:
        raise HTTPException(status_code=404, detail="Session not found")

    session_dir = os.path.join(SESSIONS_DIR, session_id)
    photos_dir = os.path.join(session_dir, "photos")
    
    if not os.path.exists(photos_dir):
        raise HTTPException(status_code=404, detail="Session photos not found")

    zip_filename = f"originals_{session_id}.zip"
    zip_path = os.path.join(RESULTS_DIR, zip_filename)

    with ZipFile(zip_path, 'w') as zf:
        for filename in os.listdir(photos_dir):
            file_path = os.path.join(photos_dir, filename)
            if os.path.isfile(file_path):
                zf.write(file_path, arcname=filename)

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


@router.post("/apply_filters_to_image")
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


@router.post("/remove_background")
async def remove_background_api(file: UploadFile = File(...), threshold: int = Form(0), bg_threshold: int = Form(10), erode_size: int = Form(10)):
    try:
        input_bytes = await file.read()
        if threshold > 0:
            # Alpha Matting
            t_fg = max(10, min(threshold, 250))
            t_bg = max(0, min(bg_threshold, 250))
            t_erode = max(0, min(erode_size, 50)) # Cap erode size to prevent errors
            
            output_bytes = remove(
                input_bytes, 
                model='u2net_human_seg',
                alpha_matting=True,
                alpha_matting_foreground_threshold=t_fg,
                alpha_matting_background_threshold=t_bg, 
                alpha_matting_erode_size=t_erode
            )
        else:
             # Default fast mode
             output_bytes = remove(input_bytes, model='u2net_human_seg')

        return StreamingResponse(io.BytesIO(output_bytes), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove background: {e}")


@router.post("/process_and_stylize_image")
async def process_and_stylize_image(prompt: str = Form(...), file: UploadFile = File(...)):
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
            pollinations_url = f"https://gen.pollinations.ai/image/{encoded_prompt}"
            params = {
                "model": "kontext",
                "width": 1024,
                "height": 1024,
                "seed": random.randint(0, 1000000),
                "enhance": True,
                "negative_prompt": "worst quality, blurry",
                "private": True,
                "nologo": True,
                "nofeed": True,
                "safe": True,
                "quality": "medium",
                "image": direct_link,
                "guidance_scale": 1
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


from fastapi import Request


@router.post("/compose_image")
async def compose_image(request: Request, holes: str = Form(...), photos: List[UploadFile] = File(...), stickers: str = Form(...), texts: str = Form(None), filters: str = Form(...), transformations: str = Form(...), template_path: str = Form(None), template_file: UploadFile = File(None), background_colors: str = Form(None), video_paths: str = Form(None), is_inverted: bool = Form(False)):
    try:
        session_id = str(uuid.uuid4())
        
        # --- Persistence Setup ---
        # Create session directory structure: static/results/sessions/{session_id}/photos/
        session_dir = os.path.join(SESSIONS_DIR, session_id)
        session_photos_dir = os.path.join(session_dir, "photos")
        os.makedirs(session_photos_dir, exist_ok=True)

        if template_file:
            # Save the uploaded colored template
            temp_filename = f"{uuid.uuid4()}.png"
            base_template_path = os.path.join(UPLOAD_DIR, temp_filename)
            async with aiofiles.open(base_template_path, 'wb') as out_file:
                content = await template_file.read()
                await out_file.write(content)
            
            # Also save template path to session data
            saved_template_path = base_template_path
        elif template_path:
            # Use the path from the form
            base_template_path = os.path.join(os.getcwd(), template_path.lstrip('/'))
            saved_template_path = template_path
        else:
            raise HTTPException(status_code=400, detail="No template provided.")

        print(f"Received filters: {filters}")
        hole_data = json.loads(holes)
        filter_data = json.loads(filters)
        transform_data = json.loads(transformations)
        template_img = cv2.imread(base_template_path, cv2.IMREAD_UNCHANGED)
        height, width, _ = template_img.shape
        canvas = np.full((height, width, 3), 255, np.uint8)

        parsed_video_paths = []
        if video_paths:
             try:
                 parsed_video_paths = json.loads(video_paths)
             except:
                 pass

        saved_photo_paths = []

        for i, photo_file in enumerate(photos):
            hole = hole_data[i]
            transform = transform_data[i]
            photo_content = await photo_file.read()

            # Save Original Photo for persistence
            photo_filename = f"photo_{i}.jpg"
            saved_photo_path = os.path.join(session_photos_dir, photo_filename)
            async with aiofiles.open(saved_photo_path, 'wb') as f:
                await f.write(photo_content)
            saved_photo_paths.append(f"/{saved_photo_path.replace(os.path.sep, '/')}")
            
            # --- Background Removal & Coloring ---
            bg_color_hex = None
            if background_colors:
                try:
                    bg_colors_list = json.loads(background_colors)
                    if i < len(bg_colors_list):
                        bg_color_hex = bg_colors_list[i]
                except:
                    pass

            if bg_color_hex:
                # Remove background
                output_bytes = remove(photo_content, model='u2net_human_seg')
                foreground = Image.open(io.BytesIO(output_bytes)).convert("RGBA")
                
                # Create solid color background
                # Hex to RGB
                h = bg_color_hex.lstrip('#')
                rgb = tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (255,) # Add alpha
                
                background = Image.new("RGBA", foreground.size, rgb)
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

            # High-Quality Resizing Logic
            h_orig, w_orig = filtered_photo.shape[:2]
            
            if new_w < w_orig or new_h < h_orig:
                interpolation = cv2.INTER_AREA
            else:
                interpolation = cv2.INTER_LANCZOS4
                
            resized_photo = cv2.resize(filtered_photo, (new_w, new_h), interpolation=interpolation)
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
        # use session_id in filename
        result_filename = f"{session_id}.png"
        result_path = os.path.join(RESULTS_DIR, result_filename)
        cv2.imwrite(result_path, final_image_bgra)

        ip_address = get_ip_address()
        full_url = f"http://{ip_address}:{PORT}/static/results/{result_filename}"
        qr_img = qrcode.make(full_url)
        qr_filename = f"qr_{session_id}.png"
        qr_path = os.path.join(RESULTS_DIR, qr_filename)
        qr_img.save(qr_path)
        
        # --- Save Session Metadata ---
        session_metadata = {
            "session_id": session_id,
            "holes": hole_data,
            "stickers": placed_stickers,
            "texts": json.loads(texts) if texts else [],
            "filters": filter_data,
            "transformations": transform_data,
            "template_path": saved_template_path,
            "background_colors": json.loads(background_colors) if background_colors else [],
            "photos": saved_photo_paths,
            "videos": parsed_video_paths,
            "is_inverted": is_inverted,
            "result_path": f"/static/results/{result_filename}",
            "qr_code_path": f"/static/results/{qr_filename}",
            "timestamp": os.path.getmtime(result_path)
        }
        
        await session_manager.save_session(session_id, session_metadata)

        return JSONResponse(content={
            "result_path": f"/static/results/{result_filename}",
            "qr_code_path": f"/static/results/{qr_filename}",
            "session_id": session_id
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to compose image: {e}")


@router.get("/recent_results")
async def get_recent_results(limit: int = 50, skip: int = 0):
    results_files = []
    for filename in os.listdir(RESULTS_DIR):
        if filename.endswith(".png") and 'qr' not in filename:
            file_path = os.path.join(RESULTS_DIR, filename)
            if os.path.isfile(file_path):
                mod_time = os.path.getmtime(file_path)
                # Try to extract session_id (filename without extension)
                session_id = os.path.splitext(filename)[0]
                results_files.append({
                    "path": f"/{file_path}", 
                    "mod_time": mod_time,
                    "session_id": session_id
                })
    
    # Sort by modification time, newest first
    results_files.sort(key=lambda x: x["mod_time"], reverse=True)
    
    # Apply pagination
    recent_items = results_files[skip : skip + limit]
    
    return JSONResponse(content=recent_items)


@router.get("/session/{session_id}")
async def get_session_data(session_id: str):
    session_data = await session_manager.get_session(session_id)
    if not session_data:
        raise HTTPException(status_code=404, detail="Session not found")
    return JSONResponse(content=session_data)


@router.get("/ghosts")
async def get_ghosts():
    ghost_dir = "static/ghost"
    if not os.path.exists(ghost_dir):
        return JSONResponse(content=[])
    ghosts = [f"/{ghost_dir}/{f}" for f in os.listdir(ghost_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif'))]
    return JSONResponse(content=ghosts)
