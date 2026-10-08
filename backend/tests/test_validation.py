import pytest

from conftest import trip, write_trips


@pytest.mark.parametrize("amount", [0, -100])
def test_v01_amount_not_positive(client, amount):
    assert client.post("/api/trips", json=trip(amount=amount, commission=0)).status_code == 422


@pytest.mark.parametrize("end", ["2026-10-02T10:00:00+05:00", "2026-10-02T09:59:00+05:00", "2026-10-02T05:00:00Z"])
def test_v02_end_not_after_start(client, end):
    r = client.post("/api/trips", json=trip(end=end))
    assert r.status_code == 422
    assert "detail" in r.json()


@pytest.mark.parametrize("commission", [-1, 2001])
def test_v03_commission_out_of_range(client, commission):
    assert client.post("/api/trips", json=trip(commission=commission)).status_code == 422


def test_v03_commission_equal_amount_ok(client):
    assert client.post("/api/trips", json=trip(commission=2000)).status_code == 201


@pytest.mark.parametrize("payment", ["Cash", "CARD", "kaspi", "", None])
def test_v04_bad_payment(client, payment):
    assert client.post("/api/trips", json=trip(payment=payment)).status_code == 422


@pytest.mark.parametrize("field", ["start", "end"])
@pytest.mark.parametrize("value", ["2026-10-02T10:00:00", "2026-10-02", 1790000000, "not a date"])
def test_v05_timestamp_without_offset(client, field, value):
    assert client.post("/api/trips", json=trip(**{field: value})).status_code == 422


@pytest.mark.parametrize("day", ["2026-13-01", "2026-02-30", "2026-1-1", "20261001", "2026-10-01T00:00", "abc"])
def test_v06_bad_date(client, day):
    assert client.get(f"/api/days/{day}").status_code == 422


@pytest.mark.parametrize("field", ["amount", "commission"])
@pytest.mark.parametrize("value", [100.0, 100.5, True, "100"])
def test_v07_non_integer_money(client, field, value):
    assert client.post("/api/trips", json=trip(**{field: value})).status_code == 422


@pytest.mark.parametrize("body", [
    trip(tip=100),
    trip(id=""),
    trip(id=" t3"),
    trip(id="x" * 101),
    {k: v for k, v in trip().items() if k != "payment"},
])
def test_v08_unknown_field_or_bad_id(client, body):
    assert client.post("/api/trips", json=body).status_code == 422


def test_e01_corrupt_file(client, trips_file):
    trips_file.write_text("[{broken", encoding="utf-8")
    r = client.get("/api/days/2026-10-01")
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "STORAGE_ERROR"
    assert "broken" not in r.text
    assert client.post("/api/trips", json=trip()).status_code == 500
    assert trips_file.read_text(encoding="utf-8") == "[{broken"


@pytest.mark.parametrize("content", [
    [trip(id="a"), trip(id="a")],  # duplicate ids
    [trip(amount=0)],              # invalid record
])
def test_e01_invalid_records_in_file(client, trips_file, content):
    write_trips(trips_file, content)
    before = trips_file.read_bytes()
    assert client.get("/api/days/2026-10-02").status_code == 500
    assert client.post("/api/trips", json=trip(id="new")).status_code == 500
    assert trips_file.read_bytes() == before
