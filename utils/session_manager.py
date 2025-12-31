import os
import json
import asyncio
import aiofiles
from fastapi import HTTPException

SESSIONS_DIR = "static/results/sessions"

class SessionManager:
    def __init__(self, sessions_dir=SESSIONS_DIR):
        self.sessions_dir = sessions_dir
        # Simple in-memory lock dict to prevent race conditions on the same session ID
        self._locks = {}

    def _get_lock(self, session_id):
        if session_id not in self._locks:
            self._locks[session_id] = asyncio.Lock()
        return self._locks[session_id]

    def _get_file_path(self, session_id):
        return os.path.join(self.sessions_dir, f"{session_id}.json")

    async def save_session(self, session_id, data):
        """Creates or overwrites a session file."""
        file_path = self._get_file_path(session_id)
        lock = self._get_lock(session_id)
        
        async with lock:
            async with aiofiles.open(file_path, 'w') as f:
                await f.write(json.dumps(data, indent=4))

    async def get_session(self, session_id):
        """Reads a session file."""
        file_path = self._get_file_path(session_id)
        if not os.path.exists(file_path):
            return None
        
        # We generally don't need a lock for reading unless we want strict consistency,
        # but for simple usage pure read is fine.
        async with aiofiles.open(file_path, 'r') as f:
            content = await f.read()
            return json.loads(content)

    async def update_session(self, session_id, updates):
        """Updates specific fields in a session file safely."""
        file_path = self._get_file_path(session_id)
        lock = self._get_lock(session_id)

        async with lock:
            if not os.path.exists(file_path):
                raise HTTPException(status_code=404, detail="Session not found")

            async with aiofiles.open(file_path, 'r') as f:
                data = json.loads(await f.read())
            
            # Apply updates
            data.update(updates)
            
            async with aiofiles.open(file_path, 'w') as f:
                await f.write(json.dumps(data, indent=4))
            
            return data

# Global instance
session_manager = SessionManager()
