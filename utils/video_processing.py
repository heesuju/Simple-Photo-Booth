from proglog import ProgressBarLogger


class CustomProgressLogger(ProgressBarLogger):
    """Custom logger to track video composition progress"""
    def __init__(self, session_id, video_progress_dict):
        super().__init__()
        self.session_id = session_id
        self.video_progress = video_progress_dict
        self.video_progress[session_id] = 0
        print(f"[ProgressLogger] Initialized for session {session_id}")
        
    def callback(self, **changes):
        """Called by proglog when any progress is made"""
        # Update progress in the global dict
        for key, new_value in changes.items():
            # Key is typically a tuple like ('t', 'index')
            if isinstance(key, tuple) and len(key) == 2:
                name, param = key
                if param == 'index' and name in self.bars:
                    bar = self.bars[name]
                    if 'total' in bar and bar['total'] > 0:
                        percentage = int((new_value / bar['total']) * 100)
                        self.video_progress[self.session_id] = min(percentage, 100)
                        print(f"[ProgressLogger] Progress: {percentage}%")
        
        # Call parent to maintain normal progress bar functionality
        super().callback(**changes)
    
    def bars_callback(self, bar, attr, value, old_value=None):
        """Alternative callback method"""
        if attr == 'index' and bar in self.bars:
            total = self.bars[bar].get('total', 0)
            if total > 0:
                percentage = int((value / total) * 100)
                self.video_progress[self.session_id] = min(percentage, 100)
                print(f"[ProgressLogger] bars_callback - Progress: {percentage}%")
