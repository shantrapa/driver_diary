from datetime import date
from typing import Annotated, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    field_validator,
    model_validator,
)


class Trip(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Annotated[str, Field(min_length=1, max_length=100)]
    start: AwareDatetime
    end: AwareDatetime
    amount: Annotated[StrictInt, Field(gt=0)]
    payment: Literal["cash", "card"]
    commission: Annotated[StrictInt, Field(ge=0)]

    @field_validator("id")
    @classmethod
    def no_edge_whitespace(cls, v: str) -> str:
        if v != v.strip():
            raise ValueError("id must not have leading/trailing whitespace")
        return v

    @field_validator("start", "end", mode="before")
    @classmethod
    def iso_string_only(cls, v: object) -> object:
        # Pydantic would otherwise accept unix timestamps; contract says ISO 8601 string.
        if not isinstance(v, str):
            raise ValueError("must be an ISO 8601 string with UTC offset")
        return v

    @model_validator(mode="after")
    def check_business_rules(self) -> "Trip":
        if self.end <= self.start:
            raise ValueError("end must be later than start")
        if self.commission > self.amount:
            raise ValueError("commission must not exceed amount")
        return self


class PaymentBreakdown(BaseModel):
    cash: int
    card: int


class Summary(BaseModel):
    trip_count: int
    revenue: int
    commission: int
    net: int
    payment_breakdown: PaymentBreakdown


class DayResponse(BaseModel):
    date: date
    timezone: str
    summary: Summary
    trips: list[Trip]


class TripResult(BaseModel):
    trip: Trip
    duplicate: bool
