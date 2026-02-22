"""Tests for the file watcher service."""

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from q2h.config import WatcherConfig
from q2h.watcher.service import FileWatcherService


@pytest.mark.asyncio(loop_scope="session")
async def test_watcher_disabled_returns_none():
    config = WatcherConfig(enabled=False, paths=[])
    svc = FileWatcherService(config, AsyncMock())
    result = svc.start()
    assert result is None


@pytest.mark.asyncio(loop_scope="session")
async def test_watcher_no_paths_returns_none():
    config = WatcherConfig(enabled=True, paths=[])
    svc = FileWatcherService(config, AsyncMock())
    result = svc.start()
    assert result is None


@pytest.mark.asyncio(loop_scope="session")
async def test_watcher_detects_new_csv(tmp_path: Path):
    callback = AsyncMock()
    config = WatcherConfig(
        enabled=True,
        paths=[str(tmp_path)],
        poll_interval=1,
        stable_seconds=0,  # no wait in tests
    )
    svc = FileWatcherService(config, callback)

    # Start watcher (initial scan finds nothing)
    task = svc.start()
    assert task is not None

    # Give the initial scan time to run
    await asyncio.sleep(0.5)

    # Drop a CSV file into the watched directory
    csv_file = tmp_path / "report_test.csv"
    csv_file.write_text("IP,QID,Title\n10.0.0.1,1234,Test Vuln\n")

    # Wait for poll cycle to detect it
    await asyncio.sleep(2.5)

    await svc.stop()

    # Callback should have been invoked with the csv file path
    assert callback.call_count == 1
    called_path = callback.call_args[0][0]
    assert called_path.name == "report_test.csv"


@pytest.mark.asyncio(loop_scope="session")
async def test_watcher_ignores_existing_files(tmp_path: Path):
    callback = AsyncMock()

    # Pre-create a file before watcher starts
    existing = tmp_path / "existing.csv"
    existing.write_text("data")

    config = WatcherConfig(
        enabled=True,
        paths=[str(tmp_path)],
        poll_interval=1,
        stable_seconds=0,
    )
    svc = FileWatcherService(config, callback)
    task = svc.start()

    await asyncio.sleep(2.5)
    await svc.stop()

    # The pre-existing file should NOT trigger import
    callback.assert_not_called()


@pytest.mark.asyncio(loop_scope="session")
async def test_watcher_ignores_non_csv(tmp_path: Path):
    callback = AsyncMock()
    config = WatcherConfig(
        enabled=True,
        paths=[str(tmp_path)],
        poll_interval=1,
        stable_seconds=0,
    )
    svc = FileWatcherService(config, callback)
    task = svc.start()

    await asyncio.sleep(0.5)

    # Drop a non-CSV file
    (tmp_path / "notes.txt").write_text("hello")
    await asyncio.sleep(2.5)

    await svc.stop()
    callback.assert_not_called()
