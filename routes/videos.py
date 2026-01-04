import os
import uuid
import json
import subprocess
import asyncio
import aiofiles
import qrcode
import numpy as np
import moviepy.editor as mpe
from urllib.parse import unquote
from typing import List
from PIL import Image
from fastapi import APIRouter, Request, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from utils.common import get_ip_address
from utils.image_processing import load_image_with_premultiplied_alpha
from utils.drawing import draw_texts_on_pil
from utils.video_processing import CustomProgressLogger
from utils.session_manager import session_manager

router = APIRouter()

PORT = 8000
UPLOAD_DIR = "static/uploads"
RESULTS_DIR = "static/results"
VIDEOS_DIR = "static/videos"


@router.post("/upload_video_chunk")
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


@router.get("/video_progress/{session_id}")
async def get_video_progress(request: Request, session_id: str):
    """Get the current progress of video composition"""
    # Access video_progress from app state
    video_progress = request.app.state.video_progress
    progress = video_progress.get(session_id, 0)
    print(f"[ProgressEndpoint] Session {session_id}: {progress}%")
    return JSONResponse(content={"progress": progress})


@router.post("/compose_video")
async def compose_video(
    request: Request,
    holes: str = Form(...),
    video_paths: List[str] = Form(...),
    stickers: str = Form(...),
    texts: str = Form(None),
    transformations: str = Form(...),
    template_path: str = Form(None),
    template_file: UploadFile = File(None),
    is_inverted: bool = Form(False),
    session_id: str = Form(None)  # Session ID for progress tracking
):
    try:
        # Generate session ID if not provided
        if not session_id:
            session_id = str(uuid.uuid4())

        # --- Handle template file or path ---
        if template_file:
            temp_filename = f"{uuid.uuid4()}.png"
            base_template_path = os.path.join(UPLOAD_DIR, temp_filename)
            async with aiofiles.open(base_template_path, "wb") as out_file:
                content = await template_file.read()
                await out_file.write(content)
        elif template_path:
            # Unquote template path
            decoded_path = unquote(template_path.lstrip("/"))
            base_template_path = os.path.join(os.getcwd(), decoded_path)
        else:
            raise HTTPException(status_code=400, detail="No template provided.")

        # --- Parse form data ---
        hole_data = json.loads(holes)
        sticker_data = json.loads(stickers)
        transform_data = json.loads(transformations)

        def fix_webm_metadata(input_path):
            """Repair or transcode broken WebM files so MoviePy can read them."""
            if not input_path.lower().endswith(".webm"):
                return input_path

            fixed_copy = input_path.replace(".webm", "_fixed.webm")
            fixed_mp4 = input_path.replace(".webm", "_fixed.mp4")

            # Step 1: try fast lossless rewrap
            cmd_copy = f'ffmpeg -y -i "{input_path}" -c copy -movflags +faststart "{fixed_copy}"'
            result = subprocess.run(cmd_copy, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if result.returncode == 0 and os.path.exists(fixed_copy):
                return fixed_copy

            # Step 2: fallback to mp4 transcode (slower but reliable)
            cmd_transcode = f'ffmpeg -y -i "{input_path}" -c:v libx264 -preset ultrafast -pix_fmt yuv420p "{fixed_mp4}"'
            subprocess.run(cmd_transcode, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            os.remove(fixed_copy) if os.path.exists(fixed_copy) else None
            return fixed_mp4 if os.path.exists(fixed_mp4) else input_path

        def validate_video(path):
            """Validate with ffprobe."""
            cmd = [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path,
            ]
            try:
                subprocess.run(cmd, capture_output=True, text=True, check=True)
            except subprocess.CalledProcessError:
                # If validation fails, try to repair once
                repaired = fix_webm_metadata(path)
                # Retry validation silently
                try:
                    subprocess.run(cmd, capture_output=True, text=True, check=True)
                    return repaired
                except subprocess.CalledProcessError:
                    raise HTTPException(status_code=400, detail=f"Invalid or corrupted video file: {path}")
            return path

        # --- Load and validate video clips ---
        clips = []
        for path in video_paths:
            # Unquote video path
            decoded_path = unquote(path.lstrip("/"))
            full_path = os.path.join(os.getcwd(), decoded_path)
            full_path = fix_webm_metadata(full_path)  # ensure reindexed
            full_path = validate_video(full_path)
            clips.append(mpe.VideoFileClip(full_path))

        min_duration = min(clip.duration for clip in clips)
        clips = [clip.subclip(clip.duration - min_duration) for clip in clips]

        # --- Template prep ---
        template_np = load_image_with_premultiplied_alpha(base_template_path)
        height, width, _ = template_np.shape
        background_clip = mpe.ColorClip(size=(width, height), color=(0, 0, 0), duration=min_duration)

        # --- Place videos ---
        video_clips = []
        for i, clip in enumerate(clips):
            hole = hole_data[i]
            transform = transform_data[i]
            scale = transform.get("scale", 1)
            rotation = -transform.get("rotation", 0)
            new_w = int(hole["w"] * scale)
            new_h = int(hole["h"] * scale)

            # Center Crop Logic to prevent stretching
            target_aspect_ratio = new_w / new_h
            video_w, video_h = clip.w, clip.h
            video_aspect_ratio = video_w / video_h

            if video_aspect_ratio > target_aspect_ratio:
                # Video is wider than target: Crop width
                crop_h = video_h
                crop_w = crop_h * target_aspect_ratio
                x1 = (video_w - crop_w) / 2
                y1 = 0
            else:
                # Video is taller than target: Crop height
                crop_w = video_w
                crop_h = crop_w / target_aspect_ratio
                x1 = 0
                y1 = (video_h - crop_h) / 2
            
            # Apply crop and then resize
            cropped_clip = clip.crop(x1=x1, y1=y1, width=crop_w, height=crop_h)
            resized_clip = cropped_clip.resize((new_w, new_h)).rotate(rotation)

            if is_inverted:
                resized_clip = resized_clip.fx(mpe.vfx.mirror_x)
            pos_x = hole["x"] + (hole["w"] - resized_clip.w) // 2
            pos_y = hole["y"] + (hole["h"] - resized_clip.h) // 2
            video_clips.append(resized_clip.set_position((pos_x, pos_y)).set_duration(min_duration))

        # --- Text rendering (drawn onto template) ---
        if texts:
            texts_data = json.loads(texts)
            db_manager = request.app.state.db_manager
            template_pil = Image.fromarray(template_np)
            template_pil = draw_texts_on_pil(template_pil, texts_data, db_manager)
            template_np = np.array(template_pil)

        # --- Template overlay ---
        template_clip = mpe.ImageClip(template_np, transparent=True).set_duration(min_duration)

        # --- Stickers (anti-aliased) ---
        sticker_clips = []
        for sticker in sticker_data:
            # Unquote sticker path
            decoded_path = unquote(sticker["path"].lstrip("/"))
            sticker_path = os.path.join(os.getcwd(), decoded_path)
            resize_size = (sticker["width"], sticker["height"])
            rotation = -float(sticker.get("rotation", 0))

            sticker_np = load_image_with_premultiplied_alpha(
                sticker_path,
                resize_to=resize_size,
                rotate_deg=rotation
            )

            # Calculate centered position to account for rotation expansion
            s_h, s_w, _ = sticker_np.shape
            pos_x = int(sticker["x"]) - (s_w - int(sticker["width"])) // 2
            pos_y = int(sticker["y"]) - (s_h - int(sticker["height"])) // 2

            sticker_clip = (
                mpe.ImageClip(sticker_np, transparent=True)
                .set_duration(min_duration)
                .set_position((pos_x, pos_y))
            )
            sticker_clips.append(sticker_clip)

        # --- Combine all layers ---
        final_clip = mpe.CompositeVideoClip(
            [background_clip] + video_clips + [template_clip] + sticker_clips,
            size=(width, height),
        )

        # --- Write output ---
        result_filename = f"{uuid.uuid4()}.mp4"
        result_path = os.path.join(RESULTS_DIR, result_filename)
        
        # Use custom logger to track progress (pass video_progress from app state)
        video_progress = request.app.state.video_progress
        logger = CustomProgressLogger(session_id, video_progress)
        
        # Run video composition in background thread to avoid blocking progress requests
        def compose_video_sync():
            final_clip.write_videofile(result_path, codec="libx264", fps=24, logger=logger)
            video_progress[session_id] = 100
        
        # Execute in thread pool to not block the event loop
        await asyncio.to_thread(compose_video_sync)

        # --- Generate QR code ---
        ip_address = get_ip_address()
        full_url = f"http://{ip_address}:{PORT}/static/results/{result_filename}"
        qr_img = qrcode.make(full_url)
        qr_filename = f"qr_{uuid.uuid4()}.png"
        qr_path = os.path.join(RESULTS_DIR, qr_filename)
        qr_img.save(qr_path)

        # --- Update Session Metadata ---
        try:
            updates = {
                "video_result_path": f"/static/results/{result_filename}",
                "video_qr_path": f"/static/results/{qr_filename}"
            }
            await session_manager.update_session(session_id, updates)
            print(f"Updated session {session_id} with video result.")
        except Exception as e:
            print(f"Failed to update session metadata with video path: {e}")

        return JSONResponse(
            content={
                "result_path": f"/static/results/{result_filename}",
                "qr_code_path": f"/static/results/{qr_filename}",
                "session_id": session_id,
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compose video: {e}")
