# Web Photobooth

This is a web-based photobooth application built with FastAPI and vanilla JavaScript. It allows users to take photos using their webcam, arrange them in a template, add stickers and filters, and generate a final composite image and video.

## Project Structure

```
.
├── .gitignore
├── app.py                  # Main FastAPI application backend (minimal entry point)
├── db_manager.py           # SQLite database management
├── README.md               # This file
├── requirements.txt        # Python dependencies
├── routes/                 # API Route Modules
│   ├── __init__.py
│   ├── colors.py           # Color management endpoints
│   ├── fonts.py            # Font management endpoints
│   ├── photos.py           # Photo processing & composition
│   ├── settings.py         # App settings & theme
│   ├── stickers.py         # Sticker management
│   ├── styles.py           # Style & filter preset endpoints
│   ├── templates.py        # Template management
│   └── videos.py           # Video processing & composition
├── utils/                  # Helper Utilities
│   ├── __init__.py
│   ├── common.py           # Common helper functions
│   ├── drawing.py          # Text drawing functions
│   ├── filters.py          # Image filter application
│   ├── image_processing.py # Core image processing logic
│   ├── template_generation.py # Template generation logic
│   └── video_processing.py # Video processing logic
├── static/                 # All frontend assets
│   ├── components/         # HTML snippets for different UI screens
│   │   ├── main_menu.html
│   │   ├── photo_taking_screen.html
│   │   ├── result_screen.html
│   │   ├── review_screen.html
│   │   └── template_edit_screen.html
│   ├── css/
│   │   ├── common.css
│   │   ├── global.css
│   │   ├── main_menu.css
│   │   ├── photo_taking_screen.css
│   │   ├── result_screen.css
│   │   ├── review_screen.css
│   │   └── template_edit_screen.css
│   ├── js/
│   │   ├── main.js         # Main frontend script, event bus, and screen management
│   │   └── components/     # JavaScript logic for each UI component
│   │       ├── main_menu.js
│   │       ├── photo_taking.js
│   │       ├── result.js
│   │       ├── review.js
│   │       ├── transformable.js # Handles move/rotate/scale logic for items
│   │       ├── template_edit.js
│   │       └── shared/
│   │           ├── color_picker.js
│   │           ├── crop.js
│   │           └── text_edit.js
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
    *   **`transformable.js`**: A generic component that handles the logic for moving, rotating, and scaling elements (like stickers and text) on the preview canvas. This centralizes the transformation code to reduce redundancy.
    *   **Main Menu (`main_menu.js`)**: Fetches available layouts from the backend and displays them. Allows users to upload their own custom templates.
    *   **Photo Taking (`photo_taking.js`)**:
        *   Accesses the user's webcam using `navigator.mediaDevices.getUserMedia`.
        *   Handles the photo capture sequence, including a countdown timer.
        *   Allows users to upload photos from their device as an alternative.
        *   Records video from the camera stream during the photo-taking process.
    *   **Review & Edit (`review.js`)**:
        *   Displays a live preview of the final image.
        *   Allows users to drag-and-drop to swap photos between slots.
        *   Fetches and displays available stickers and allows adding text.
        *   Uses `transformable.js` to handle moving, resizing, and rotating stickers and text on the canvas.
        *   Applies CSS and SVG filters in real-time to the photo previews.
    *   **Result (`result.js`)**:
        *   On finalization, it sends all the data (photos, template info, sticker placements, filter values, video clips) to the backend's `/compose_image` and `/compose_video` endpoints.
        *   Displays the final generated image, a download button, and the QR code provided by the backend.

    *   **Shared Components (`static/js/components/shared/`)**: These are reusable modals that provide common functionality needed across different screens.
        *   **Color Picker (`color_picker.js`)**: A modal that uses the `iro.js` library to provide a color selection wheel. It can be initialized with a default color and returns the user's selection. It also allows users to save a chosen color as a preset, which sends the new color to the backend to be saved for future use.
        *   **Cropping Modal (`crop.js`)**: A tool for cropping images to a specific aspect ratio. It displays a modal with the image and a draggable, resizable crop overlay. It handles the logic for maintaining the aspect ratio and returns the final cropped image data as a Blob, which can then be used for previews or sent to the server.
        *   **Text Edit Modal (`text_edit.js`)**: A comprehensive modal for adding and editing text elements. It allows users to input text, select from available fonts (loaded from the server), choose a color from a palette (which integrates the `color_picker.js` for adding new colors), and set text justification (left, center, right). It also provides a live preview of the text as the user makes changes.

3.  **CSS (`static/css/`)**:
    *   **`global.css`**: Contains base styles for the entire application, such as `html`, `body`, and container styles.
    *   **`common.css`**: Contains styles for shared components that are used across multiple screens, such as headers and sidebars.
    *   **Screen-specific CSS**: Each screen has its own CSS file (e.g., `photo_taking_screen.css`) that contains styles specific to that screen. These are loaded dynamically by `main.js` when the corresponding screen is shown.

4.  **Database (`db_manager.py`)**:
    *   A simple class that abstracts SQLite operations.
    *   Manages a `templates` table (storing paths, hole coordinates, aspect ratios) and a `stickers` table (storing paths).

## Running the Application

1.  Install dependencies: `pip install -r requirements.txt`
2.  Run the server: `python app.py`
3.  Open a web browser and navigate to `http://localhost:8000`.
