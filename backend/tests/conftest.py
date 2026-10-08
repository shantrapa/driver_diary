import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

SAMPLE = Path(__file__).resolve().parent.parent / "data" / "trips.json"


@pytest.fixture
def trips_file(tmp_path, monkeypatch) -> Path:
    """Temp copy of the sample file; the committed trips.json is never touched."""
    path = tmp_path / "trips.json"
    shutil.copy(SAMPLE, path)
    monkeypatch.setenv("TRIPS_FILE", str(path))
    return path


@pytest.fixture
def client(trips_file) -> TestClient:
    return TestClient(app)


def write_trips(path: Path, trips: list[dict]) -> None:
    path.write_text(json.dumps(trips), encoding="utf-8")


def trip(id="x1", start="2026-10-02T10:00:00+05:00", end="2026-10-02T10:25:00+05:00",
         amount=2000, payment="cash", commission=300, **extra) -> dict:
    return dict(id=id, start=start, end=end, amount=amount, payment=payment,
                commission=commission, **extra)
