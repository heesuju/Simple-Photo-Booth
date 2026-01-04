import os
import cv2
import numpy as np
import random
import re


# --- Configuration ---
TEMPLATE_CONFIGS = {
    "typeA": {
        "margins": {"top": 30, "bottom": 180, "left": 30, "right": 30},
        "gaps": {"row": 30, "col": 30}
    },
    "typeB": {
        "margins": {"top": 20, "bottom": 20, "left": 20, "right": 20},
        "gaps": {"row": 10, "col": 40}
    },
    "typeC": {
        "margins": {"top": 180, "bottom": 30, "left": 30, "right": 30},
        "gaps": {"row": 30, "col": 30}
    }
}


def generate_default_templates(db_manager, generated_templates_dir="static/generated_templates"):
    # Layouts now map to a list of types to generate
    layouts = {
        "2:3": [{"layout": "1x1", "types": ["typeA"]}],
        "3:4": [{"layout": "1x3", "types": ["typeA"]}],
        "4:3": [
            {"layout": "1x4", "types": ["typeA", "typeC"]},
            {"layout": "2x4", "types": ["typeB"]}
        ],
        "4:5": [{"layout": "2x2", "types": ["typeA"]}],
        "1:1": [{"layout": "3x2", "types": ["typeA"]}]
    }

    for ar_str, layout_configs in layouts.items():
        for config in layout_configs:
            layout_str = config["layout"]
            types_to_generate = config["types"]
            
            for type_name in types_to_generate:
                generate_template_if_not_exists(
                    db_manager, 
                    ar_str, 
                    layout_str, 
                    type_name, 
                    generated_templates_dir
                )


def generate_template_if_not_exists(db_manager, ar_str, layout_str, type_name, generated_templates_dir="static/generated_templates"):
    suffix = "" if type_name == "typeA" else f"_{type_name}"
    
    filename = f"template_{ar_str.replace(':', '_')}_{layout_str}{suffix}.png"
    file_path = os.path.join(generated_templates_dir, filename)
    template_path_for_db = f"/{file_path}"
    template_path_for_db = template_path_for_db.replace("\\", "/") # Ensure forward slashes for DB

    if os.path.exists(file_path): 
        print(f"Template file {filename} already exists. Skipping generation.")
        return

    print(f"Generating {type_name} template for {ar_str} {layout_str}...")

    try:
        ar_w, ar_h = map(int, ar_str.split(':'))
        cols, rows = map(int, layout_str.split('x'))
        
        config = TEMPLATE_CONFIGS.get(type_name)
        if not config:
            print(f"Unknown template type: {type_name}")
            return

        template, holes = create_template_image(ar_w, ar_h, cols, rows, config)

        # Save the generated template
        os.makedirs(generated_templates_dir, exist_ok=True)
        cv2.imwrite(file_path, template)

        # Add to database
        hole_count = len(holes)
        transformations = [{'scale': 1, 'rotation': 0} for _ in holes]
        
        db_manager.add_template(template_path_for_db, hole_count, holes, ar_str, layout_str, transformations, is_default=True)

        # Generate the layout thumbnail (only needs to be done once per layout, but harmless to repeat)
        generate_layout_thumbnail(ar_str, layout_str, "static/layouts")

        print(f"Successfully generated and saved {type_name} template for {ar_str} {layout_str}.")

    except Exception as e:
        print(f"Error generating template for {ar_str} {layout_str}: {e}")
        import traceback
        traceback.print_exc()


def create_template_image(ar_w, ar_h, cols, rows, config):
    base_photo_w = 480
    base_photo_h = int(base_photo_w * ar_h / ar_w)
    
    margins = config["margins"]
    gaps = config["gaps"]
    
    # Calculate Template Dimensions
    # Width = Left Margin + (Cols * PhotoW) + ((Cols - 1) * ColGap) + Right Margin
    template_w = margins["left"] + (base_photo_w * cols) + (gaps["col"] * (cols - 1)) + margins["right"]
    
    # Height = Top Margin + (Rows * PhotoH) + ((Rows - 1) * RowGap) + Bottom Margin
    template_h = margins["top"] + (base_photo_h * rows) + (gaps["row"] * (rows - 1)) + margins["bottom"]

    # Create a 4-channel image (BGRA) initialized to white
    template = np.full((template_h, template_w, 4), (255, 255, 255, 255), np.uint8)

    holes = []
    for r in range(rows):
        for c in range(cols):
            # Calculate x position
            # x = Left Margin + (Col Index * (PhotoW + ColGap))
            x = margins["left"] + c * (base_photo_w + gaps["col"])
            
            # Calculate y position
            # y = Top Margin + (Row Index * (PhotoH + RowGap))
            y = margins["top"] + r * (base_photo_h + gaps["row"])
            
            # Set the hole area to be transparent
            template[y:y+base_photo_h, x:x+base_photo_w, 3] = 0
            holes.append({"x": x, "y": y, "w": base_photo_w, "h": base_photo_h})
            
    return template, holes


def generate_layout_thumbnail(aspect_ratio, cell_layout, output_dir):
    # Generate a unique filename for the thumbnail
    filename = f"{aspect_ratio.replace(':', '_')}_{cell_layout}.png"
    os.makedirs(output_dir, exist_ok=True)
    thumbnail_path = os.path.join(output_dir, filename)
    
    # Check if the thumbnail already exists
    if os.path.exists(thumbnail_path):
        return f"/{thumbnail_path}"

    # Parse aspect ratio and cell layout
    try:
        ar_w, ar_h = map(int, aspect_ratio.split(':'))
        cols, rows = map(int, cell_layout.split('x'))
    except ValueError:
        return None

    # Define cell dimensions based on aspect ratio
    cell_base_dim = 100
    cell_w = cell_base_dim
    cell_h = int(cell_base_dim * ar_h / ar_w)

    # Define image dimensions based on cell layout and dimensions
    gap = 10
    img_w = (cell_w * cols) + (gap * (cols + 1))
    img_h = (cell_h * rows) + (gap * (rows + 1))

    # Create a white canvas
    canvas = np.full((img_h, img_w, 3), (255, 255, 255), np.uint8)

    # Define pastel colors
    pastel_colors = [
        (255, 204, 204),  # Light Pink
        (204, 229, 255),  # Light Blue
        (204, 255, 204),  # Light Green
        (255, 229, 204),  # Light Orange
        (229, 204, 255),  # Light Purple
        (255, 255, 204)   # Light Yellow
    ]

    # Load and organize placeholder images
    placeholder_dir = "static/placeholder"
    
    if not os.path.exists(placeholder_dir):
        print(f"Warning: Placeholder directory '{placeholder_dir}' not found. Using solid colors only.")
        return _render_solid_color_thumbnail(canvas, rows, cols, cell_w, cell_h, gap, pastel_colors, thumbnail_path)
    
    files = [f for f in os.listdir(placeholder_dir) if f.endswith('.png')]
    if not files:
        return _render_solid_color_thumbnail(canvas, rows, cols, cell_w, cell_h, gap, pastel_colors, thumbnail_path)

    # 1. Organize by Theme
    themes = {}
    for f in files:
        match = re.match(r"([a-zA-Z]+)", f)
        if match:
            theme = match.group(1)
            if theme not in themes:
                themes[theme] = []
            themes[theme].append(f)
    
    if not themes:
        themes["generic"] = files

    # 2. Pick ONE random theme
    selected_theme = random.choice(list(themes.keys()))
    theme_files = themes[selected_theme]

    # 3. Organize into Pairs and Singles
    grouped_by_key = {}
    all_ids = set()
    
    for f in theme_files:
        key = re.sub(r'\d+', '', f)
        if key not in grouped_by_key:
            grouped_by_key[key] = []
        grouped_by_key[key].append(f)
        
        id_match = re.search(r'(\d+)', f)
        if id_match:
            all_ids.add(id_match.group(1))
    
    sorted_ids = list(all_ids)
    random.shuffle(sorted_ids)
    id_rank = {id_str: i for i, id_str in enumerate(sorted_ids)}

    def get_sort_key(filename):
        m = re.search(r'(\d+)', filename)
        if m:
            return id_rank.get(m.group(1), 9999), filename
        return 9999, filename

    pairs = []
    singles = []

    for key, group in grouped_by_key.items():
        group.sort(key=get_sort_key)
        
        i = 0
        while i < len(group) - 1:
            pairs.append((group[i], group[i+1]))
            i += 2
        
        if i < len(group):
            singles.append(group[i])

    random.shuffle(pairs)
    random.shuffle(singles)

    pairs = [(os.path.join(placeholder_dir, p1), os.path.join(placeholder_dir, p2)) for p1, p2 in pairs]
    singles = [os.path.join(placeholder_dir, s) for s in singles]

    # 4. Render Grid
    offset = random.randint(0, len(pastel_colors) - 1)
    
    pair_idx = 0
    single_idx = 0

    for r in range(rows):
        for c in range(cols):
            x = gap + c * (cell_w + gap)
            y = gap + r * (cell_h + gap)
            
            # Draw Cell Background
            cell_bg_color = pastel_colors[(r * cols + c + offset) % len(pastel_colors)]
            cell_bg = np.full((cell_h, cell_w, 3), cell_bg_color, np.uint8)
            canvas[y:y + cell_h, x:x + cell_w] = cell_bg

            # Determine Content
            is_wide_or_square = cell_w >= cell_h
            
            if is_wide_or_square:
                if not pairs and not singles:
                    continue

                if pairs:
                    p1, p2 = pairs[pair_idx % len(pairs)]
                    pair_idx += 1
                    
                    _draw_image_on_canvas(canvas, p1, x, y, cell_w, cell_h, mode="left")
                    _draw_image_on_canvas(canvas, p2, x, y, cell_w, cell_h, mode="right")
                
                else:
                    s = singles[single_idx % len(singles)]
                    single_idx += 1
                    _draw_image_on_canvas(canvas, s, x, y, cell_w, cell_h, mode="center")
            
            else:
                effective_singles = singles + [p for pair in pairs for p in pair]
                
                if effective_singles:
                    s = effective_singles[single_idx % len(effective_singles)]
                    single_idx += 1
                    _draw_image_on_canvas(canvas, s, x, y, cell_w, cell_h, mode="center")

    # Save
    cv2.imwrite(thumbnail_path, canvas)
    return f"/{thumbnail_path}"


def _render_solid_color_thumbnail(canvas, rows, cols, cell_w, cell_h, gap, colors, path):
    offset = random.randint(0, len(colors) - 1)
    for r in range(rows):
        for c in range(cols):
            x = gap + c * (cell_w + gap)
            y = gap + r * (cell_h + gap)
            color = colors[(r * cols + c + offset) % len(colors)]
            canvas[y:y + cell_h, x:x + cell_w] = color
    cv2.imwrite(path, canvas)
    return f"/{path}"


def _draw_image_on_canvas(canvas, img_path, x, y, cell_w, cell_h, mode="center"):
    img = cv2.imread(img_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        return

    img_h, img_w, _ = img.shape
    
    target_w = cell_w
    target_h = cell_h
    target_x = x
    target_y = y

    if mode == "left":
        # Width 55%, aligned left
        target_w = int(cell_w * 0.55)
        target_x = x
    elif mode == "right":
        # Width 55%, aligned right (overlap)
        target_w = int(cell_w * 0.55)
        target_x = x + (cell_w - target_w)
    # else center: default

    # Scale to cover target area (maintain aspect ratio, crop overflow)
    scale = max(target_w / img_w, target_h / img_h)
    new_w, new_h = int(img_w * scale), int(img_h * scale)
    resized_img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # Crop center of resized image to fit target dim
    crop_x = (new_w - target_w) // 2
    crop_y = (new_h - target_h) // 2
    
    # Ensure legal slicing
    if crop_x < 0: crop_x = 0
    if crop_y < 0: crop_y = 0
    
    cropped_img = resized_img[crop_y:crop_y + target_h, crop_x:crop_x + target_w]

    # Alpha blend onto canvas
    # Verify dimensions match exactly (resize/crop might have rounding errors)
    ch, cw, _ = cropped_img.shape
    if ch != target_h or cw != target_w:
        cropped_img = cv2.resize(cropped_img, (target_w, target_h))

    alpha_img = cropped_img[:, :, 3] / 255.0
    alpha_canvas = 1.0 - alpha_img

    for i in range(3):
        canvas[target_y:target_y+target_h, target_x:target_x+target_w, i] = (
            alpha_img * cropped_img[:,:,i] + 
            alpha_canvas * canvas[target_y:target_y+target_h, target_x:target_x+target_w, i]
        )