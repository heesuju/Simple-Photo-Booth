# Web Photobooth

This is a web-based photobooth application built with FastAPI and vanilla JavaScript. It allows users to take photos using their webcam, arrange them in a template, add stickers and filters, and generate a final composite image and video.

## Project Structure

```
.
├── .gitignore
├── app.py                  # Main FastAPI application backend
├── db_manager.py           # SQLite database management
├── README.md               # This file
├── requirements.txt        # Python dependencies
├── static/                 # All frontend assets
│   ├── components/         # HTML snippets for different UI screens
│   │   ├── main_menu.html
│   │   ├── photo_taking_screen.html
│   │   ├── result_screen.html
│   │   ├── review_screen.html
│   │   └── template_edit_screen.html
│   ├── css/
│   │   └── style.css       # Main stylesheet
│   ├── js/
│   │   ├── main.js         # Main frontend script, event bus, and screen management
│   │   └── components/     # JavaScript logic for each UI component
│   │       ├── main_menu.js
│   │       ├── photo_taking.js
│   │       ├── result.js
│   │       ├── review.js
│   │       ├── shared.js
│   │       └── template_edit.js
│   ├── generated_templates/ # Default templates generated on startup
│   ├── layouts/            # Thumbnails for different layouts
│   ├── placeholder/        # Placeholder images for layout thumbnails
│   ├── results/            # Saved final images, videos, and QR codes
│   ├── stickers/           # Sticker images
│   └── uploads/            # User-uploaded templates
└── templates/
    └── index.html          # Main HTML entry point
```

## How It Works

The application is a single-page application (SPA) where different "screens" are shown or hidden dynamically by JavaScript.

1.  **Backend (`app.py`)**:
    *   Built with **FastAPI**.
    *   Serves the main `index.html` and all static assets.
    *   Uses **OpenCV** for all image processing tasks:
        *   Detecting transparent "holes" in user-uploaded templates.
        *   Applying filters (brightness, contrast, etc.).
        *   Compositing photos, templates, and stickers into a final image.
    *   Uses **MoviePy** to compose video clips, the template, and stickers into a final video.
    *   Uses **`db_manager.py`** to interact with a **SQLite** database that stores information about available templates and stickers.
    *   On startup, it automatically generates a set of default templates and scans the `static/stickers` directory to update the database.
    *   Generates a QR code for easy downloading of the final image to a mobile device.

2.  **Frontend (`static/js/`)**:
    *   Written in **vanilla JavaScript**, organized into components.
    *   A simple **Event Bus** (`main.js`) is used for communication between components, avoiding tight coupling.
    *   **Main Menu (`main_menu.js`)**: Fetches available layouts from the backend and displays them. Allows users to upload their own custom templates.
    *   **Photo Taking (`photo_taking.js`)**:
        *   Accesses the user's webcam using `navigator.mediaDevices.getUserMedia`.
        *   Handles the photo capture sequence, including a countdown timer.
        *   Allows users to upload photos from their device as an alternative.
        *   Records video from the camera stream during the photo-taking process.
    *   **Review & Edit (`review.js`)**:
        *   Displays a live preview of the final image.
        *   Allows users to drag-and-drop to swap photos between slots.
        *   Fetches and displays available stickers, allowing them to be added, moved, resized, and rotated on the canvas.
        *   Applies CSS and SVG filters in real-time to the photo previews.
    *   **Result (`result.js`)**:
        *   On finalization, it sends all the data (photos, template info, sticker placements, filter values, video clips) to the backend's `/compose_image` and `/compose_video` endpoints.
        *   Displays the final generated image, a download button, and the QR code provided by the backend.

3.  **Database (`db_manager.py`)**:
    *   A simple class that abstracts SQLite operations.
    *   Manages a `templates` table (storing paths, hole coordinates, aspect ratios) and a `stickers` table (storing paths).

## Running the Application

1.  Install dependencies: `pip install -r requirements.txt`
2.  Run the server: `python app.py`
3.  Open a web browser and navigate to `http://localhost:8000`.

## TODO:
- [X] Basic UI
- [X] Capture Timer
- [X] Stickers
- [X] Effects(Monotone, Contrast, etc)
- [X] Upload Pictures
- [X] Video Download
- [X] Original Image Download
- [X] Default Templates & Color Change
- [X] Retake photos
- [X] Continue Editing
- [ ] Remove Background Option
- [ ] Add color selection to text
- [ ] Effect Presets
- [ ] Refine UI
- [X] Connect Image Generation API
- [ ] Add button in results to take another photo
- [ ] Add timestamp, logos, text to stickers tab
- [ ] Add image resizing to cells preview

## Bugs:
- [ ] Stickers have black background sometimes
- [ ] Resized stickers have weird borders in video composition
- [ ] Template not editable when uploading
- [ ] Disable generate style when generating in progress
- [ ] Add cancel button to style
- [ ] Add refresh button to style
- [ ] fix video creation for image uploaded
- [X] Add crop edit for uploaded photos
fix video capture enabled for uploads
fix crop right offset