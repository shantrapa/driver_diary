import json
import logging
import os
import tempfile
import threading
from pathlib import Path

from pydantic import TypeAdapter, ValidationError

from .models import Trip

log = logging.getLogger(__name__)

_trips_adapter = TypeAdapter(list[Trip])
# ponytail: one in-process lock for every repository; run uvicorn with a single worker.
# Multi-process deployments would need a file lock (or a real DB).
_lock = threading.Lock()


class StorageError(Exception):
    """Trip file is unreadable, corrupt or could not be written."""


class TripConflict(Exception):
    """Trip with this id already exists with different data."""


class TripRepository:
    def __init__(self, path: Path):
        self.path = Path(path)

    def load(self) -> list[Trip]:
        if not self.path.exists():
            return []
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as e:
            log.error("Cannot read trips file %s: %s", self.path, type(e).__name__)
            raise StorageError("Cannot read trips file") from e
        try:
            trips = _trips_adapter.validate_python(raw)
        except ValidationError as e:
            locs = [err["loc"] for err in e.errors(include_input=False)]
            log.error("Invalid records in trips file %s at %s", self.path, locs)
            raise StorageError("Trips file contains invalid records") from e
        ids = [t.id for t in trips]
        if len(ids) != len(set(ids)):
            log.error("Duplicate trip ids in trips file %s", self.path)
            raise StorageError("Trips file contains duplicate ids")
        return trips

    def add(self, trip: Trip) -> tuple[Trip, bool]:
        """Store trip. Returns (stored_trip, created). Raises TripConflict on id clash."""
        with _lock:
            trips = self.load()
            for existing in trips:
                if existing.id == trip.id:
                    # Aware datetimes compare by instant, so +05:00 vs Z of one moment is equal.
                    if existing == trip:
                        return existing, False
                    raise TripConflict(trip.id)
            trips.append(trip)
            self._save(trips)
            return trip, True

    def _save(self, trips: list[Trip]) -> None:
        data = _trips_adapter.dump_json(trips, indent=2) + b"\n"
        tmp_name = None
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                dir=self.path.parent, prefix=".trips-", suffix=".tmp", delete=False
            ) as tmp:
                tmp_name = tmp.name
                tmp.write(data)
                tmp.flush()
                os.fsync(tmp.fileno())
            os.replace(tmp_name, self.path)
        except OSError as e:
            log.error("Cannot write trips file %s: %s", self.path, type(e).__name__)
            if tmp_name and os.path.exists(tmp_name):
                os.unlink(tmp_name)
            raise StorageError("Cannot write trips file") from e
