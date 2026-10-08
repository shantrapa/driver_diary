from datetime import date
from zoneinfo import ZoneInfo

from .models import PaymentBreakdown, Summary, Trip

TIMEZONE = "Asia/Almaty"
TZ = ZoneInfo(TIMEZONE)


def trips_for_day(trips: list[Trip], day: date) -> list[Trip]:
    """Trips whose start, converted to Asia/Almaty, falls on `day`; sorted by start, then id."""
    selected = [t for t in trips if t.start.astimezone(TZ).date() == day]
    return sorted(selected, key=lambda t: (t.start, t.id))


def summarize(trips: list[Trip]) -> Summary:
    revenue = sum(t.amount for t in trips)
    commission = sum(t.commission for t in trips)
    return Summary(
        trip_count=len(trips),
        revenue=revenue,
        commission=commission,
        net=revenue - commission,
        payment_breakdown=PaymentBreakdown(
            cash=sum(t.amount for t in trips if t.payment == "cash"),
            card=sum(t.amount for t in trips if t.payment == "card"),
        ),
    )
