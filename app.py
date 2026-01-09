import os
import uvicorn
import json
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from db_manager import DatabaseManager
from utils.template_generation import generate_default_templates
from dotenv import load_dotenv

# Import route modules
from routes import templates, colors, styles, stickers, fonts, photos, videos, settings
from routes.stickers import generate_thumbnail

load_dotenv()

# --- Global Configuration ---
CONFIG_FILE = 'config.json'
PORT = 8000

if os.path.exists(CONFIG_FILE):
    try:
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
            PORT = config.get('port', 8000)
    except Exception as e:
        print(f"Error loading config.json: {e}. Using default port {PORT}")

DATABASE = 'photobooth.db'
UPLOAD_DIR = "static/uploads"
STICKERS_DIR = "static/stickers"
FONTS_DIR = "static/fonts"
RESULTS_DIR = "static/results"
GENERATED_TEMPLATES_DIR = "static/generated_templates"
VIDEOS_DIR = "static/videos"

# Global dictionary to track video composition progress
video_progress = {}  # {session_id: progress_percentage}


# --- Lifespan Management (Startup/Shutdown) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db_manager = DatabaseManager(DATABASE)
    app.state.db_manager.init_db()
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(STICKERS_DIR, exist_ok=True)
    os.makedirs(FONTS_DIR, exist_ok=True)
    os.makedirs(RESULTS_DIR, exist_ok=True)
    os.makedirs(GENERATED_TEMPLATES_DIR, exist_ok=True)
    os.makedirs(VIDEOS_DIR, exist_ok=True)

    # --- Sync Stickers with DB ---
    db_manager = app.state.db_manager
    
    generate_default_templates(db_manager, GENERATED_TEMPLATES_DIR)

    existing_stickers = {s['sticker_path'] for s in db_manager.get_all_stickers()}

    for root, dirs, files in os.walk(STICKERS_DIR):
        for filename in files:
            # Skip thumbnail files themselves
            if filename.endswith('_thumb.png') or root.endswith('thumbnails'):
                continue
                
            cat = root.replace('\\', '/')
            sticker_path = f"/{cat}/{filename}"
            if sticker_path not in existing_stickers:
                category = os.path.basename(root) if root != STICKERS_DIR else None
                # Generate thumbnail for new sticker
                file_path = sticker_path[1:]  # Remove leading slash
                thumbnail_path = generate_thumbnail(file_path)
                db_manager.add_sticker(sticker_path, category, thumbnail_path)
                print(f"Added new sticker to DB: {sticker_path} with category: {category}")
    
    # Generate missing thumbnails for existing stickers
    all_stickers = db_manager.get_all_stickers()
    for sticker in all_stickers:
        if not sticker.get('thumbnail_path'):
            file_path = sticker['sticker_path'][1:]  # Remove leading slash
            if os.path.exists(file_path):
                thumbnail_path = generate_thumbnail(file_path)
                if thumbnail_path:
                    db_manager.update_sticker_thumbnail(sticker['id'], thumbnail_path)
                    print(f"Generated thumbnail for existing sticker: {sticker['sticker_path']}")

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

    # Load initial theme from DB, default to 'light'
    app.state.current_theme = db_manager.get_setting('theme', 'light')
    
    # Make video_progress accessible to routes
    app.state.video_progress = video_progress
    
    print(f"Initial theme loaded: {app.state.current_theme}")

    yield


# --- App Initialization ---
app = FastAPI(lifespan=lifespan)


def populate_default_colors(db_manager):
    default_colors = ['#FFFFFF', '#000000', '#FFDDC1', '#FFABAB', '#FFC3A0', '#B5EAD7', '#C7CEEA']
    for color in default_colors:
        db_manager.add_color(color)


# --- Static Files ---
app.mount("/static", StaticFiles(directory="static"), name="static")


# --- Include Routers ---
app.include_router(settings.router, tags=["settings"])
app.include_router(templates.router, tags=["templates"])
app.include_router(colors.router, tags=["colors"])
app.include_router(styles.router, tags=["styles"])
app.include_router(stickers.router, tags=["stickers"])
app.include_router(fonts.router, tags=["fonts"])
app.include_router(photos.router, tags=["photos"])
app.include_router(videos.router, tags=["videos"])


# --- Main Entry Point ---
if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=False)