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
                    holes TEXT NOT NULL
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

    def add_template(self, template_path, hole_count, holes):
        """Adds a new template record to the database."""
        holes_json = json.dumps(holes)
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO templates (template_path, hole_count, holes) VALUES (?, ?, ?)",
                (template_path, hole_count, holes_json)
            )
            conn.commit()
