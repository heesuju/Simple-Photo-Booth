import cv2
import numpy as np
from PIL import Image


def load_image_with_premultiplied_alpha(path, resize_to=None, rotate_deg=0):
    img = Image.open(path).convert("RGBA")

    # Optional high-quality resize (ensure ints)
    if resize_to is not None:
        resize_to = (int(resize_to[0]), int(resize_to[1]))
        img = img.resize(resize_to, Image.LANCZOS)

    # Optional rotation with anti-aliasing
    if rotate_deg != 0:
        img = img.rotate(rotate_deg, resample=Image.BICUBIC, expand=True)

    np_img = np.array(img).astype(float)
    alpha = np_img[..., 3:4] / 255.0
    np_img[..., :3] *= alpha
    np_img = np_img.astype(np.uint8)
    return np_img


def rotate_image(image, angle):
    (h, w) = image.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    cos = np.abs(M[0, 0])
    sin = np.abs(M[0, 1])
    new_w = int((h * sin) + (w * cos))
    new_h = int((h * cos) + (w * sin))
    M[0, 2] += (new_w / 2) - center[0]
    M[1, 2] += (new_h / 2) - center[1]
    return cv2.warpAffine(image, M, (new_w, new_h))


def hex_to_rgba(hex_color, alpha=255):
    """Convert hex color to RGBA tuple.
    
    Args:
        hex_color: Hex color string (with or without #)
        alpha: Alpha value (0-255)
        
    Returns:
        Tuple of (R, G, B, A) values
        
    Raises:
        ValueError: If hex_color is invalid
    """
    hex_color = hex_color.lstrip('#')
    if len(hex_color) != 6:
        raise ValueError(f"Invalid hex color: expected 6 characters, got {len(hex_color)}")
    try:
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4)) + (alpha,)
    except ValueError as e:
        raise ValueError(f"Invalid hex color '{hex_color}': {e}")