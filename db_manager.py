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
                    transformations TEXT
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS stickers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sticker_path TEXT NOT NULL
                )
            ''')

            # Check if the transformations column exists
            cursor.execute("PRAGMA table_info(templates)")
            columns = [column[1] for column in cursor.fetchall()]
            if 'transformations' not in columns:
                cursor.execute("ALTER TABLE templates ADD COLUMN transformations TEXT")

            conn.commit()

    def add_template(self, template_path, hole_count, holes, aspect_ratio, cell_layout, transformations):
        """Adds a new template record to the database."""
        holes_json = json.dumps(holes)
        transformations_json = json.dumps(transformations)
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO templates (template_path, hole_count, holes, aspect_ratio, cell_layout, transformations) VALUES (?, ?, ?, ?, ?, ?)",
                (template_path, hole_count, holes_json, aspect_ratio, cell_layout, transformations_json)
            )
            conn.commit()

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

    def add_sticker(self, sticker_path):
        """Adds a new sticker record to the database."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO stickers (sticker_path) VALUES (?)",
                (sticker_path,)
            )
            conn.commit()
