import os
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from utils.image_processing import hex_to_rgba


def draw_texts_on_pil(base_image, texts_data, db_manager):
    """Draw text overlays on a PIL image.
    
    Args:
        base_image: PIL Image object
        texts_data: List of text configuration dictionaries
        db_manager: DatabaseManager instance
        
    Returns:
        PIL Image with text overlays
    """
    if not texts_data:
        return base_image

    for text_info in texts_data:
        font_name = text_info.get('font')
        font_info = db_manager.get_font_by_name(font_name)
        if not font_info:
            print(f"Font '{font_name}' not found in database. Skipping text.")
            continue

        font_path = os.path.join(os.getcwd(), font_info['font_path'].lstrip('/'))
        if not os.path.exists(font_path):
            print(f"Font file not found at '{font_path}'. Skipping text.")
            continue

        text = text_info.get('text', '')
        font_size = int(text_info.get('fontSize') or 40)
        x = int(text_info.get('x') or 0)
        y = int(text_info.get('y') or 0)
        width = int(text_info.get('width') or 0)
        height = int(text_info.get('height') or 0) # Get height from frontend
        justify = text_info.get('justify', 'left')
        color = text_info.get('color', '#000000')
        rotation = -float(text_info.get('rotation') or 0)
        fill_color = hex_to_rgba(color)

        try:
            font = ImageFont.truetype(font_path, font_size)
        except IOError:
            print(f"Failed to load font '{font_path}'. Skipping text.")
            continue
        # spacing = Target - Default = (1.3 * font_size) - ascent
        ascent, descent = font.getmetrics()
        line_spacing = int((font_size * 1.3) - ascent)

        temp_draw = ImageDraw.Draw(Image.new('RGBA', (1,1)))
        bbox = temp_draw.multiline_textbbox((0,0), text, font=font, align=justify, spacing=line_spacing)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]

        # Trust the frontend's width and height as the container dimensions
        # BUT expand them if the text is actally larger (to prevent clipping due to font metric diffs)
        canvas_w = max(width, text_width) if width > 0 else text_width
        canvas_h = max(height, text_height) if height > 0 else text_height
        
        text_canvas = Image.new('RGBA', (canvas_w, canvas_h), (255, 255, 255, 0))
        draw = ImageDraw.Draw(text_canvas)

        # Calculate exact center offsets
        # We want to center the bounding box of the text within the canvas
        x_offset = (canvas_w - text_width) / 2 - bbox[0]
        y_offset = (canvas_h - text_height) / 2 - bbox[1]

        draw.multiline_text((x_offset, y_offset), text, font=font, fill=fill_color, align=justify, spacing=line_spacing)

        # Premultiply alpha to fix jagged edges
        np_canvas = np.array(text_canvas).astype(float)
        alpha = np_canvas[..., 3:4] / 255.0
        np_canvas[..., :3] *= alpha
        text_canvas = Image.fromarray(np_canvas.astype(np.uint8))

        rotated_text = text_canvas.rotate(rotation, expand=True, resample=Image.BICUBIC)

        center_x = x + width / 2
        center_y = y + height / 2  # Use original height for center reference
        paste_x = int(center_x - rotated_text.width / 2)
        paste_y = int(center_y - rotated_text.height / 2)

        base_image.paste(rotated_text, (paste_x, paste_y), rotated_text)

    return base_image


def draw_texts(image, texts_data, db_manager):
    """Draw text overlays on an OpenCV image.
    
    Args:
        image: OpenCV image (BGRA numpy array)
        texts_data: List of text configuration dictionaries
        db_manager: DatabaseManager instance
        
    Returns:
        OpenCV image with text overlays (BGRA numpy array)
    """
    if not texts_data:
        return image

    base_image = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGRA2RGBA))

    for text_info in texts_data:
        font_name = text_info.get('font')
        font_info = db_manager.get_font_by_name(font_name)
        if not font_info:
            print(f"Font '{font_name}' not found in database. Skipping text.")
            continue

        font_path = os.path.join(os.getcwd(), font_info['font_path'].lstrip('/'))
        if not os.path.exists(font_path):
            print(f"Font file not found at '{font_path}'. Skipping text.")
            continue

        text = text_info.get('text', '')
        font_size = int(text_info.get('fontSize') or 40)
        x = int(text_info.get('x') or 0)
        y = int(text_info.get('y') or 0)
        width = int(text_info.get('width') or 0)
        height = int(text_info.get('height') or 0) # Get height from frontend
        justify = text_info.get('justify', 'left')
        color = text_info.get('color', '#000000')
        rotation = -float(text_info.get('rotation') or 0)
        fill_color = hex_to_rgba(color)

        try:
            font = ImageFont.truetype(font_path, font_size)
        except IOError:
            print(f"Failed to load font '{font_path}'. Skipping text.")
            continue
            
        # Calculate dynamic line spacing to match CSS line-height: 1.3
        ascent, descent = font.getmetrics()
        line_spacing = int((font_size * 1.3) - ascent)

        temp_draw = ImageDraw.Draw(Image.new('RGBA', (1,1)))
        bbox = temp_draw.multiline_textbbox((0,0), text, font=font, align=justify, spacing=line_spacing)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]

        # Trust the frontend's width and height as the container dimensions
        # BUT expand them if the text is actally larger (to prevent clipping due to font metric diffs)
        canvas_w = max(width, text_width) if width > 0 else text_width
        canvas_h = max(height, text_height) if height > 0 else text_height
        
        text_canvas = Image.new('RGBA', (canvas_w, canvas_h), (255, 255, 255, 0))
        draw = ImageDraw.Draw(text_canvas)

        # Calculate exact center offsets
        x_offset = (canvas_w - text_width) / 2 - bbox[0]
        y_offset = (canvas_h - text_height) / 2 - bbox[1]

        draw.multiline_text((x_offset, y_offset), text, font=font, fill=fill_color, align=justify, spacing=line_spacing)

        rotated_text = text_canvas.rotate(rotation, expand=True, resample=Image.BICUBIC)

        center_x = x + width / 2
        center_y = y + height / 2 # Use original height for center reference
        paste_x = int(center_x - rotated_text.width / 2)
        paste_y = int(center_y - rotated_text.height / 2)

        base_image.paste(rotated_text, (paste_x, paste_y), rotated_text)

    return cv2.cvtColor(np.array(base_image), cv2.COLOR_RGBA2BGRA)
