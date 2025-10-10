import sqlite3
import json

class DatabaseManager:
    def __init__(self, db_path):
        self.db_path = db_path

    def _get_connection(self):
        """Creates and returns a new database connection."""
        conn = sqlite3.connect(self.db_path)
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
                    cell_layout TEXT NOT NULL
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS stickers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sticker_path TEXT NOT NULL
                )
            ''')
            conn.commit()

    def get_all_templates(self):
        """Fetches all templates from the database."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM templates ORDER BY id DESC")
            templates = [dict(row) for row in cursor.fetchall()]
        
        # Decode the JSON string for holes for each template
        for t in templates:
            if t.get('holes'):
                t['holes'] = json.loads(t['holes'])
        return templates

    def add_template(self, template_path, hole_count, holes, aspect_ratio, cell_layout):
        """Adds a new template record to the database."""
        holes_json = json.dumps(holes)
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO templates (template_path, hole_count, holes, aspect_ratio, cell_layout) VALUES (?, ?, ?, ?, ?)",
                (template_path, hole_count, holes_json, aspect_ratio, cell_layout)
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
            template = dict(cursor.fetchone())

        # Decode the JSON string for holes
        if template and template.get('holes'):
            template['holes'] = json.loads(template['holes'])
        return template

    def get_templates_by_layout(self, aspect_ratio, cell_layout):
        """Fetches all templates that match the given layout."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM templates WHERE aspect_ratio = ? AND cell_layout = ?", (aspect_ratio, cell_layout))
            templates = [dict(row) for row in cursor.fetchall()]
        
        # Decode the JSON string for holes for each template
        for t in templates:
            if t.get('holes'):
                t['holes'] = json.loads(t['holes'])
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
