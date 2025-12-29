import cv2
import numpy as np


def apply_filters(image, filters):
    """Apply image filters to a photo.
    
    Args:
        image: Input image (BGR numpy array)
        filters: Dictionary of filter values
        
    Returns:
        Filtered image (BGR numpy array)
    """
    brightness = int(filters.get('brightness', 100))
    contrast = int(filters.get('contrast', 100))
    saturate = int(filters.get('saturate', 100))
    warmth = int(filters.get('warmth', 100))
    sharpness = int(filters.get('sharpness', 0))
    blur = int(filters.get('blur', 0))
    grain = int(filters.get('grain', 0))

    # --- Brightness & Contrast ---
    img_float = image.astype(np.float32)
    brightness_factor = brightness / 100.0
    img_float = img_float * brightness_factor
    contrast_factor = contrast / 100.0
    if contrast_factor != 1.0:
        mean = np.array([128, 128, 128], dtype=np.float32)
        img_float = mean + contrast_factor * (img_float - mean)
    img_float = np.clip(img_float, 0, 255)
    image = img_float.astype(np.uint8)

    # --- Saturation ---
    if saturate != 100:
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV).astype(np.float32)
        h, s, v = cv2.split(hsv)
        saturation_factor = saturate / 100.0
        s = s * saturation_factor
        s = np.clip(s, 0, 255)
        final_hsv = cv2.merge([h, s, v])
        image = cv2.cvtColor(final_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    # --- Warmth ---
    if warmth != 100:
        # Map 0-200 slider to a range of -50 to 50 for adjustment
        warmth_value = (warmth - 100) / 2.0 
        # Split channels
        b, g, r = cv2.split(image.astype(np.float32))
        # Add warmth (increase red, decrease blue)
        r += warmth_value
        b -= warmth_value
        # Clip values
        r = np.clip(r, 0, 255)
        b = np.clip(b, 0, 255)
        image = cv2.merge([b, g, r]).astype(np.uint8)

    # --- Sharpness ---
    if sharpness > 0:
        amount = sharpness / 100.0
        # This kernel matches the SVG filter on the frontend
        kernel = np.array([[0, -amount, 0],
                           [-amount, 1 + 4 * amount, -amount],
                           [0, -amount, 0]])
        # Work with a float image for convolution, then clip and convert back
        float_image = image.astype(np.float32)
        sharpened_float = cv2.filter2D(float_image, -1, kernel)
        image = np.clip(sharpened_float, 0, 255).astype(np.uint8)

    # --- Blur --
    if blur > 0:
        # The CSS blur() pixel value corresponds to sigma. We pass it directly.
        # Setting kernel size to (0,0) makes OpenCV calculate it from sigma.
        image = cv2.GaussianBlur(image, (0, 0), blur)

    # --- Grain ---
    if grain > 0:
        noise = np.random.normal(0, grain, image.shape).astype(np.int16)
        image = np.clip(image.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    return image
