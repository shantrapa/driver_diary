import json
import threading
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from app.main import app
from app.models import Trip
from app.repository import TripRepository
from conftest import trip

T3 = trip(id="t3")


def ids_in(path):
    return [t["id"] for t in json.loads(path.read_text(encoding="utf-8"))]


def test_i01_create(client, trips_file):
    r = client.post("/api/trips", json=T3)
    assert r.status_code == 201
    assert r.json() == {"trip": T3, "duplicate": False}
    assert ids_in(trips_file) == ["t1", "t2", "t3"]
    assert client.get("/api/days/2026-10-02").json()["summary"]["revenue"] == 2000


def test_i02_identical_repeat(client, trips_file):
    client.post("/api/trips", json=T3)
    r = client.post("/api/trips", json=T3)
    assert r.status_code == 200
    assert r.json() == {"trip": T3, "duplicate": True}
    assert ids_in(trips_file).count("t3") == 1


def test_i03_same_id_different_data(client, trips_file):
    client.post("/api/trips", json=T3)
    before = trips_file.read_bytes()
    r = client.post("/api/trips", json={**T3, "amount": 2500})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "TRIP_ID_CONFLICT"
    assert trips_file.read_bytes() == before


def test_i04_equivalent_timestamps_other_offset(client, trips_file):
    client.post("/api/trips", json=T3)
    same_moment = {**T3, "start": "2026-10-02T05:00:00Z", "end": "2026-10-02T05:25:00+00:00"}
    r = client.post("/api/trips", json=same_moment)
    assert r.status_code == 200
    assert r.json()["duplicate"] is True
    assert r.json()["trip"]["start"] == "2026-10-02T10:00:00+05:00"  # stored original returned
    assert ids_in(trips_file).count("t3") == 1


def test_i05_duplicate_detected_after_restart(client, trips_file):
    assert client.post("/api/trips", json=T3).status_code == 201
    fresh = TestClient(app)  # new client; repository re-reads the file on every request
    r = fresh.post("/api/trips", json=T3)
    assert r.status_code == 200 and r.json()["duplicate"] is True
    _, created = TripRepository(trips_file).add(Trip(**T3))
    assert created is False
    assert ids_in(trips_file).count("t3") == 1


def test_i06_concurrent_identical_posts(trips_file):
    n = 8
    barrier = threading.Barrier(n)

    def submit(_):
        repo = TripRepository(trips_file)
        barrier.wait()
        return repo.add(Trip(**T3))[1]

    with ThreadPoolExecutor(n) as pool:
        created = list(pool.map(submit, range(n)))
    assert created.count(True) == 1
    assert ids_in(trips_file) == ["t1", "t2", "t3"]


def test_i06_concurrent_distinct_posts_none_lost(trips_file):
    n = 8
    barrier = threading.Barrier(n)

    def submit(i):
        barrier.wait()
        return TripRepository(trips_file).add(Trip(**trip(id=f"c{i}")))[1]

    with ThreadPoolExecutor(n) as pool:
        assert all(pool.map(submit, range(n)))
    assert sorted(ids_in(trips_file)) == sorted(["t1", "t2"] + [f"c{i}" for i in range(n)])


def test_i06_concurrent_posts_via_api(client, trips_file):
    n = 6
    barrier = threading.Barrier(n)

    def submit(_):
        barrier.wait()
        return client.post("/api/trips", json=T3).status_code

    with ThreadPoolExecutor(n) as pool:
        codes = sorted(pool.map(submit, range(n)))
    assert codes == [200] * (n - 1) + [201]
    assert ids_in(trips_file).count("t3") == 1


def test_missing_file_is_empty_and_created_on_save(tmp_path, monkeypatch):
    path = tmp_path / "sub" / "trips.json"
    monkeypatch.setenv("TRIPS_FILE", str(path))
    c = TestClient(app)
    assert c.get("/api/days/2026-10-01").json()["trips"] == []
    assert c.post("/api/trips", json=T3).status_code == 201
    assert ids_in(path) == ["t3"]
