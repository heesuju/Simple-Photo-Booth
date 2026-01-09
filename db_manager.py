import sqlite3
import json

class DatabaseManager:
    def __init__(self, db_path):
        self.db_path = db_path

    def _get_connection(self):
        """Creates and returns a new database connection."""
        conn = sqlite3.connect(self.db_path, timeout=10)
        return conn

    def init_db(self):
        """Initializes the database and creates the templates table if it doesn't exist."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS templates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    template_path TEXT NOT NULL,
                    hole_count INTEGER NOT NULL,
                    holes TEXT NOT NULL,
                    aspect_ratio TEXT NOT NULL,
                    cell_layout TEXT NOT NULL,
                    transformations TEXT,
                    is_default BOOLEAN DEFAULT 0
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS stickers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sticker_path TEXT NOT NULL,
                    category TEXT,
                    thumbnail_path TEXT
                )
            ''')

            cursor.execute("PRAGMA table_info(stickers)")
            sticker_columns = [column[1] for column in cursor.fetchall()]
            if 'category' not in sticker_columns:
                cursor.execute("ALTER TABLE stickers ADD COLUMN category TEXT")
            if 'thumbnail_path' not in sticker_columns:
                cursor.execute("ALTER TABLE stickers ADD COLUMN thumbnail_path TEXT")

            # Check if columns exist and add them if they don't
            cursor.execute("PRAGMA table_info(templates)")
            columns = [column[1] for column in cursor.fetchall()]
            if 'transformations' not in columns:
                cursor.execute("ALTER TABLE templates ADD COLUMN transformations TEXT")
            if 'is_default' not in columns:
                cursor.execute("ALTER TABLE templates ADD COLUMN is_default BOOLEAN DEFAULT 0")

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS colors (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    hex_code TEXT NOT NULL UNIQUE
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS styles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    prompt TEXT NOT NULL
                )
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS fonts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    font_name TEXT NOT NULL UNIQUE,
                    font_path TEXT NOT NULL
                )
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS filter_presets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    filter_values TEXT NOT NULL
                )
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            ''')

            conn.commit()

    def add_filter_preset(self, name, filter_values):
        """Adds a new filter preset to the database."""
        values_json = json.dumps(filter_values)
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO filter_presets (name, filter_values) VALUES (?, ?)",
                (name, values_json)
            )
            conn.commit()

    def get_all_filter_presets(self):
        """Fetches all filter presets from the database."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM filter_presets ORDER BY id")
            presets = [dict(row) for row in cursor.fetchall()]
        for p in presets:
            if p.get('filter_values'):
                p['values'] = json.loads(p['filter_values'])
                del p['filter_values']
        return presets

    def populate_default_filter_presets(self):
        """Populates the database with a default set of filter presets."""
        default_presets = [
            {"name": "Black & White", "values": {"brightness": 100, "contrast": 120, "saturate": 0, "warmth": 100, "sharpness": 10, "blur": 0, "grain": 5}},
            {"name": "Sepia", "values": {"brightness": 100, "contrast": 110, "saturate": 50, "warmth": 130, "sharpness": 0, "blur": 0, "grain": 0}},
            {"name": "Retro", "values": {"brightness": 110, "contrast": 120, "saturate": 80, "warmth": 110, "sharpness": 0, "blur": 0, "grain": 15}},
            {"name": "Vivid", "values": {"brightness": 100, "contrast": 110, "saturate": 150, "warmth": 100, "sharpness": 5, "blur": 0, "grain": 0}},
            {"name": "Cool", "values": {"brightness": 105, "contrast": 105, "saturate": 100, "warmth": 85, "sharpness": 0, "blur": 0, "grain": 0}},
            {"name": "Warm", "values": {"brightness": 105, "contrast": 105, "saturate": 100, "warmth": 115, "sharpness": 0, "blur": 0, "grain": 0}},
            {"name": "High Contrast", "values": {"brightness": 100, "contrast": 150, "saturate": 110, "warmth": 100, "sharpness": 10, "blur": 0, "grain": 0}},
            {"name": "Faded", "values": {"brightness": 110, "contrast": 80, "saturate": 70, "warmth": 100, "sharpness": 0, "blur": 1, "grain": 5}},
            {"name": "Sharp", "values": {"brightness": 100, "contrast": 100, "saturate": 100, "warmth": 100, "sharpness": 50, "blur": 0, "grain": 0}},
            {"name": "Dreamy", "values": {"brightness": 110, "contrast": 100, "saturate": 110, "warmth": 100, "sharpness": 0, "blur": 3, "grain": 0}},
        ]

        with self._get_connection() as conn:
            cursor = conn.cursor()
            for preset in default_presets:
                try:
                    values_json = json.dumps(preset["values"])
                    cursor.execute(
                        "INSERT INTO filter_presets (name, filter_values) VALUES (?, ?)",
                        (preset["name"], values_json)
                    )
                except sqlite3.IntegrityError:
                    # Preset with the same name already exists, ignore.
                    pass
            conn.commit()

    def update_filter_preset(self, preset_id, name, filter_values):
        """Updates a filter preset in the database."""
        values_json = json.dumps(filter_values)
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE filter_presets SET name = ?, filter_values = ? WHERE id = ?",
                (name, values_json, preset_id)
            )
            conn.commit()

    def delete_filter_preset(self, preset_id):
        """Deletes a filter preset from the database."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM filter_presets WHERE id = ?", (preset_id,))
                conn.commit()
        except Exception as e:
            print(f"Error deleting filter preset from database: {e}")


    def add_template(self, template_path, hole_count, holes, aspect_ratio, cell_layout, transformations, is_default=False):
        """Adds a new template record to the database."""
        holes_json = json.dumps(holes)
        transformations_json = json.dumps(transformations)
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO templates (template_path, hole_count, holes, aspect_ratio, cell_layout, transformations, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (template_path, hole_count, holes_json, aspect_ratio, cell_layout, transformations_json, is_default)
            )
            conn.commit()

    def add_color(self, hex_code):
        """Adds a new color to the database, ignoring duplicates."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("INSERT INTO colors (hex_code) VALUES (?)", (hex_code,))
                conn.commit()
            except sqlite3.IntegrityError:
                # Color already exists, ignore the error
                pass

    def get_all_colors(self):
        """Fetches all colors from the database."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM colors ORDER BY id")
            colors = [dict(row) for row in cursor.fetchall()]
        return colors

    def get_layouts(self):
        """Fetches distinct layouts (aspect_ratio and cell_layout) from the database."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT aspect_ratio, cell_layout FROM templates")
            layouts = [dict(row) for row in cursor.fetchall()]
        return layouts

    def get_template_by_layout(self, aspect_ratio, cell_layout):
        """Fetches a single template that matches the given layout."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM templates WHERE aspect_ratio = ? AND cell_layout = ? LIMIT 1", (aspect_ratio, cell_layout))
            template_row = cursor.fetchone()
        if template_row is None:
            return None
        template = dict(template_row)

        # Decode the JSON string for holes
        if template and template.get('holes'):
            template['holes'] = json.loads(template['holes'])
        if template and template.get('transformations'):
            template['transformations'] = json.loads(template['transformations'])
        return template

    def get_default_template_by_layout(self, aspect_ratio, cell_layout):
        """Fetches a single default template that matches the given layout."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM templates WHERE aspect_ratio = ? AND cell_layout = ? AND is_default = 1 LIMIT 1", (aspect_ratio, cell_layout))
            template_row = cursor.fetchone()
        if template_row is None:
            return None
        template = dict(template_row)

        # Decode the JSON string for holes
        if template and template.get('holes'):
            template['holes'] = json.loads(template['holes'])
        if template and template.get('transformations'):
            template['transformations'] = json.loads(template['transformations'])
        return template

    def get_templates_by_layout(self, aspect_ratio, cell_layout):
        """Fetches all templates that match the given layout."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM templates WHERE aspect_ratio = ? AND cell_layout = ?", (aspect_ratio, cell_layout))
            templates = [dict(row) for row in cursor.fetchall()]
        
        for t in templates:
            if t.get('holes'):
                t['holes'] = json.loads(t['holes'])
            if t.get('transformations'):
                t['transformations'] = json.loads(t['transformations'])
        return templates
    
    def get_all_stickers(self):
        """Fetches all stickers from the database."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM stickers ORDER BY id DESC")
            stickers = [dict(row) for row in cursor.fetchall()]
        return stickers
    
    def update_sticker_thumbnail(self, sticker_id, thumbnail_path):
        """Updates the thumbnail path for a sticker."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE stickers SET thumbnail_path = ? WHERE id = ?",
                (thumbnail_path, sticker_id)
            )
            conn.commit()

    def add_sticker(self, sticker_path, category=None, thumbnail_path=None):
        """Adds a new sticker record to the database."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO stickers (sticker_path, category, thumbnail_path) VALUES (?, ?, ?)",
                (sticker_path, category, thumbnail_path)
            )
            conn.commit()

    def get_all_styles(self):
        """Fetches all styles from the database."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM styles ORDER BY id")
            styles = [dict(row) for row in cursor.fetchall()]
        return styles

    def add_style(self, name, prompt):
        """Adds a new style to the database, ignoring duplicates."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("INSERT INTO styles (name, prompt) VALUES (?, ?)", (name, prompt))
                conn.commit()
            except sqlite3.IntegrityError:
                # Style with the same name already exists, ignore the error
                pass

    def delete_style(self, style_id):
        """Deletes a style from the database."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM styles WHERE id = ?", (style_id,))
                conn.commit()
        except Exception as e:
            print(f"Error deleting style from database: {e}")

    def update_style(self, style_id, name, prompt):
        """Updates a style in the database."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE styles SET name = ?, prompt = ? WHERE id = ?",
                (name, prompt, style_id)
            )
            conn.commit()

    def get_all_fonts(self):
        """Fetches all fonts from the database."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM fonts ORDER BY id")
            fonts = [dict(row) for row in cursor.fetchall()]
        return fonts

    def add_font(self, font_name, font_path):
        """Adds a new font to the database, ignoring duplicates."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("INSERT INTO fonts (font_name, font_path) VALUES (?, ?)", (font_name, font_path))
                conn.commit()
            except sqlite3.IntegrityError:
                # Font with the same name already exists, ignore the error
                pass

    def get_font_by_name(self, font_name):
        """Fetches a font by its name."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM fonts WHERE font_name = ?", (font_name,))
            font = cursor.fetchone()
        return dict(font) if font else None

    def set_setting(self, key, value):
        """Sets a key-value pair in the settings table."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))
            conn.commit()

    def get_setting(self, key, default_value=None):
        """Retrieves a setting by key, with an optional default value."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
            result = cursor.fetchone()
        return result[0] if result else default_value
