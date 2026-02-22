"""File watcher service — monitors configured directories for new Qualys CSV files."""

import asyncio
import logging
import os
import time
from pathlib import Path

from q2h.config import WatcherConfig

logger = logging.getLogger("q2h.watcher")


class FileWatcherService:
    """Polls configured paths for new .csv files and triggers import."""

    def __init__(self, config: WatcherConfig, import_callback):
        """
        Args:
            config: WatcherConfig with paths, poll_interval, stable_seconds.
            import_callback: async callable(filepath: Path) that performs the import.
        """
        self.config = config
        self.import_callback = import_callback
        self._known_files: dict[str, float] = {}  # path -> last-seen mtime
        self._running = False
        self._task: asyncio.Task | None = None

    def start(self) -> asyncio.Task:
        """Start the watcher loop as a background asyncio task."""
        if not self.config.enabled:
            logger.info("File watcher disabled in config")
            return None
        if not self.config.paths:
            logger.warning("File watcher enabled but no paths configured")
            return None

        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("File watcher started — monitoring %d path(s)", len(self.config.paths))
        for p in self.config.paths:
            logger.info("  Watching: %s", p)
        return self._task

    async def stop(self):
        """Stop the watcher loop."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("File watcher stopped")

    async def _poll_loop(self):
        """Main loop: scan directories every poll_interval seconds."""
        # Initial scan — populate known files without triggering imports
        self._initial_scan()

        while self._running:
            try:
                await asyncio.sleep(self.config.poll_interval)
                if not self._running:
                    break
                await self._scan_directories()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Error in watcher poll loop")
                await asyncio.sleep(self.config.poll_interval)

    def _initial_scan(self):
        """Record all existing CSV files so we don't re-import on startup."""
        for watch_path in self.config.paths:
            p = Path(watch_path)
            if not p.exists():
                logger.warning("Watch path does not exist: %s", watch_path)
                continue
            for csv_file in p.glob("*.csv"):
                try:
                    key = str(csv_file.resolve())
                    self._known_files[key] = csv_file.stat().st_mtime
                except OSError:
                    pass
        logger.info("Initial scan: %d existing CSV file(s) registered", len(self._known_files))

    async def _scan_directories(self):
        """Look for new or modified CSV files in watched directories."""
        for watch_path in self.config.paths:
            p = Path(watch_path)
            if not p.exists():
                continue
            for csv_file in p.glob("*.csv"):
                try:
                    key = str(csv_file.resolve())
                    current_mtime = csv_file.stat().st_mtime
                except OSError:
                    continue

                prev_mtime = self._known_files.get(key)
                if prev_mtime is not None and current_mtime == prev_mtime:
                    continue  # unchanged

                # New or modified file — check if it's stable (finished writing)
                if not self._is_stable(csv_file):
                    continue

                self._known_files[key] = current_mtime

                if prev_mtime is None:
                    logger.info("New CSV detected: %s", csv_file.name)
                else:
                    logger.info("Modified CSV detected: %s", csv_file.name)

                try:
                    await self.import_callback(csv_file)
                    logger.info("Import completed: %s", csv_file.name)
                except Exception:
                    logger.exception("Import failed: %s", csv_file.name)

    def _is_stable(self, filepath: Path) -> bool:
        """Check if the file has stopped growing (writer finished)."""
        try:
            size1 = filepath.stat().st_size
            time.sleep(self.config.stable_seconds)
            size2 = filepath.stat().st_size
            return size1 == size2 and size2 > 0
        except OSError:
            return False
