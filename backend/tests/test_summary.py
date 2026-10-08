from datetime import date

from app.models import Trip
from app.service import summarize, trips_for_day
from conftest import trip, write_trips


def test_s01_sample_day(client):
    r = client.get("/api/days/2026-10-01")
    assert r.status_code == 200
    body = r.json()
    assert body["date"] == "2026-10-01"
    assert body["timezone"] == "Asia/Almaty"
    assert body["summary"] == {
        "trip_count": 2,
        "revenue": 3900,
        "commission": 585,
        "net": 3315,
        "payment_breakdown": {"cash": 1500, "card": 2400},
    }
    assert [t["id"] for t in body["trips"]] == ["t1", "t2"]
    assert body["trips"][0]["start"] == "2026-10-01T08:10:00+05:00"


def test_s02_empty_day(client):
    body = client.get("/api/days/2026-10-02").json()
    assert body["trips"] == []
    assert body["summary"] == {
        "trip_count": 0, "revenue": 0, "commission": 0, "net": 0,
        "payment_breakdown": {"cash": 0, "card": 0},
    }


def test_s03_cash_plus_card_is_revenue():
    trips = [Trip(**trip(id=f"p{i}", payment=p, amount=a, commission=c))
             for i, (p, a, c) in enumerate([("cash", 1000, 100), ("card", 2500, 300), ("cash", 700, 0)])]
    s = summarize(trips)
    assert s.payment_breakdown.cash == 1700
    assert s.payment_breakdown.card == 2500
    assert s.payment_breakdown.cash + s.payment_breakdown.card == s.revenue == 4200
    assert s.net == 4200 - 400


def test_s04_overnight_trip_counts_on_start_date(client, trips_file):
    write_trips(trips_file, [trip(id="night", start="2026-10-03T23:50:00+05:00", end="2026-10-04T00:20:00+05:00")])
    assert [t["id"] for t in client.get("/api/days/2026-10-03").json()["trips"]] == ["night"]
    assert client.get("/api/days/2026-10-04").json()["trips"] == []


def test_s05_other_offset_grouped_by_almaty_date(client, trips_file):
    # 20:30 UTC on Oct 4 is 01:30 on Oct 5 in Almaty.
    write_trips(trips_file, [trip(id="utc", start="2026-10-04T20:30:00+00:00", end="2026-10-04T21:00:00+00:00")])
    assert client.get("/api/days/2026-10-04").json()["trips"] == []
    day = client.get("/api/days/2026-10-05").json()
    assert [t["id"] for t in day["trips"]] == ["utc"]
    assert day["summary"]["revenue"] == 2000


def test_s06_sorted_by_start_then_id(client, trips_file):
    write_trips(trips_file, [
        trip(id="c", start="2026-10-06T12:00:00+05:00", end="2026-10-06T12:30:00+05:00"),
        trip(id="b", start="2026-10-06T09:00:00+05:00", end="2026-10-06T09:30:00+05:00"),
        trip(id="a", start="2026-10-06T04:00:00+00:00", end="2026-10-06T04:30:00+00:00"),  # 09:00 Almaty
        trip(id="d", start="2026-10-06T08:00:00+05:00", end="2026-10-06T08:30:00+05:00"),
    ])
    assert [t["id"] for t in client.get("/api/days/2026-10-06").json()["trips"]] == ["d", "a", "b", "c"]


def test_trips_for_day_pure():
    trips = [Trip(**trip(id="x", start="2026-10-01T19:30:00Z", end="2026-10-01T20:00:00Z"))]
    assert trips_for_day(trips, date(2026, 10, 2))[0].id == "x"
    assert trips_for_day(trips, date(2026, 10, 1)) == []
