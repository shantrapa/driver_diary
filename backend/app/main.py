import os
import re
from datetime import date
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from .models import DayResponse, Trip, TripResult
from .repository import StorageError, TripConflict, TripRepository
from .service import TIMEZONE, summarize, trips_for_day

DEFAULT_TRIPS_FILE = Path(__file__).resolve().parent.parent / "data" / "trips.json"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

app = FastAPI(title="Дневник смен водителя")


def get_repo() -> TripRepository:
    return TripRepository(Path(os.environ.get("TRIPS_FILE", DEFAULT_TRIPS_FILE)))


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.exception_handler(TripConflict)
def on_conflict(request: Request, exc: TripConflict) -> JSONResponse:
    return _error(409, "TRIP_ID_CONFLICT", "Trip with this id already exists with different data")


@app.exception_handler(StorageError)
def on_storage_error(request: Request, exc: StorageError) -> JSONResponse:
    # Details are already logged by the repository; don't leak them to the client.
    return _error(500, "STORAGE_ERROR", "Trip storage is unavailable")


@app.get("/api/days/{day}", response_model=DayResponse, responses={422: {}, 500: {}})
def get_day(day: str, repo: TripRepository = Depends(get_repo)) -> DayResponse:
    try:
        if not DATE_RE.match(day):
            raise ValueError
        parsed = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(422, detail=[{"loc": ["path", "day"], "msg": "date must be YYYY-MM-DD", "type": "value_error"}])
    trips = trips_for_day(repo.load(), parsed)
    return DayResponse(date=parsed, timezone=TIMEZONE, summary=summarize(trips), trips=trips)


@app.post(
    "/api/trips",
    response_model=TripResult,
    status_code=201,
    responses={200: {"model": TripResult, "description": "Identical trip already exists"}, 409: {}, 500: {}},
)
def create_trip(trip: Trip, response: Response, repo: TripRepository = Depends(get_repo)) -> TripResult:
    stored, created = repo.add(trip)
    if not created:
        response.status_code = 200
    return TripResult(trip=stored, duplicate=not created)
