import os
import cv2
import numpy as np
import random


def generate_default_templates(db_manager, generated_templates_dir="static/generated_templates"):
    layouts = {
        "2:3": ["1x1"],
        "3:4": ["1x3"],
        "4:3": ["1x4"],
        "4:5": ["2x2"],
        "1:1": ["3x2"]
    }

    for ar_str, layout_list in layouts.items():
        for layout_str in layout_list:
            generate_template_if_not_exists(db_manager, ar_str, layout_str, generated_templates_dir)


def generate_template_if_not_exists(db_manager, ar_str, layout_str, generated_templates_dir="static/generated_templates"):
    # Check if a an existing DEFAULT template with this combination already exists
    if db_manager.get_default_template_by_layout(ar_str, layout_str):
        print(f"Default template for {ar_str} {layout_str} already exists. Skipping.")
        return

    print(f"Generating template for {ar_str} {layout_str}...")

    try:
        ar_w, ar_h = map(int, ar_str.split(':'))
        cols, rows = map(int, layout_str.split('x'))

        base_photo_w = 480
        base_photo_h = int(base_photo_w * ar_h / ar_w)
        gap = 30
        bottom_padding = 150

        template_w = (base_photo_w * cols) + (gap * (cols + 1))
        template_h = (base_photo_h * rows) + (gap * (rows + 1)) + bottom_padding

        # Create a 4-channel image (BGRA) initialized to white
        template = np.full((template_h, template_w, 4), (255, 255, 255, 255), np.uint8)

        holes = []
        for r in range(rows):
            for c in range(cols):
                x = gap + c * (base_photo_w + gap)
                y = gap + r * (base_photo_h + gap)
                # Set the hole area to be transparent
                template[y:y+base_photo_h, x:x+base_photo_w, 3] = 0
                holes.append({"x": x, "y": y, "w": base_photo_w, "h": base_photo_h})

        # Save the generated template
        filename = f"template_{ar_str.replace(':', '_')}_{layout_str}.png"
        os.makedirs(generated_templates_dir, exist_ok=True)
        file_path = os.path.join(generated_templates_dir, filename)
        cv2.imwrite(file_path, template)

        # Add to database
        template_path_for_db = f"/{file_path}"
        hole_count = len(holes)
        transformations = [{'scale': 1, 'rotation': 0} for _ in holes]
        db_manager.add_template(template_path_for_db, hole_count, holes, ar_str, layout_str, transformations, is_default=True)

        # Generate the layout thumbnail
        generate_layout_thumbnail(ar_str, layout_str, "static/layouts")

        print(f"Successfully generated and saved template for {ar_str} {layout_str}.")

    except Exception as e:
        print(f"Error generating template for {ar_str} {layout_str}: {e}")


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

    # Load placeholder images
    placeholder_dir = "static/placeholder"
    
    # Check if placeholder directory exists
    if not os.path.exists(placeholder_dir):
        print(f"Warning: Placeholder directory '{placeholder_dir}' not found. Using solid colors only.")
        placeholder_files = []
    else:
        placeholder_files = [f for f in os.listdir(placeholder_dir) if f.endswith('.png')]
    
    prefixes = {}
    for filename in placeholder_files:
        name = os.path.splitext(filename)[0]
        prefix = ''.join([c for c in name if not c.isdigit()]).rstrip()
        if prefix not in prefixes:
            prefixes[prefix] = []
        prefixes[prefix].append(filename)
    
    used_images = []

    total_holes = rows * cols
    
    # Pre-select images from prefixes
    if prefixes:
        available_prefixes = list(prefixes.keys())
        random.shuffle(available_prefixes)  # Shuffle to randomize selection order
        
        for selected_prefix in available_prefixes:
            # Stop if we have enough images
            if len(used_images) >= total_holes:
                break
            
            prefix_images = []
            for img_file in prefixes[selected_prefix]:
                img_path = os.path.join(placeholder_dir, img_file)
                img = cv2.imread(img_path, cv2.IMREAD_UNCHANGED)
                if img is not None:
                    prefix_images.append(img)
            
            while len(used_images) < total_holes and len(prefix_images) > 0:
                rand_idx = random.randint(0, len(prefix_images) - 1)
                used_images.append(prefix_images.pop(rand_idx))

    # Draw the grid with pre-selected images from used_images
    offset = random.randint(0, len(pastel_colors) - 1)
    image_index = 0
    
    for r in range(rows):
        for c in range(cols):
            x = gap + c * (cell_w + gap)
            y = gap + r * (cell_h + gap)
            
            # Create a cell with a pastel color background        
            cell_bg_color = pastel_colors[(r * cols + c + offset) % len(pastel_colors)]
            cell_bg = np.full((cell_h, cell_w, 3), cell_bg_color, np.uint8)

            # Place the cell background onto the canvas
            canvas[y:y + cell_h, x:x + cell_w] = cell_bg

            if used_images and image_index < len(used_images):
                person_img = used_images[image_index]
                image_index += 1

                person_h, person_w, _ = person_img.shape
                
                # Maintain aspect ratio
                scale = max(cell_w / person_w, cell_h / person_h)
                new_w, new_h = int(person_w * scale), int(person_h * scale)
                resized_person = cv2.resize(person_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
                
                # Crop the center of the resized image
                crop_x = (new_w - cell_w) // 2
                crop_y = (new_h - cell_h) // 2
                
                cropped_person = resized_person[crop_y:crop_y + cell_h, crop_x:crop_x + cell_w]
                
                # Overlay the person image onto the cell background
                # Alpha blending
                alpha_person = cropped_person[:, :, 3] / 255.0
                alpha_canvas = 1.0 - alpha_person

                for i in range(3):
                    canvas[y:y+cell_h, x:x+cell_w, i] = (alpha_person * cropped_person[:,:,i] + alpha_canvas * canvas[y:y+cell_h, x:x+cell_w, i])

    # Save the generated image
    cv2.imwrite(thumbnail_path, canvas)
    return f"/{thumbnail_path}"