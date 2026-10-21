from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, field_serializer


def _utc_iso(v: dt.datetime | None) -> str | None:
    if v is None:
        return None
    # Naive datetimes stored here are always UTC (SYSUTCDATETIME / Python utc).
    # Append Z so the browser knows to convert to local rather than treat as local.
    return v.isoformat() + "Z" if v.tzinfo is None else v.isoformat()


class ReportStats(BaseModel):
    rows_processed: int | None = None
    pdf_rows: int | None = None
    lauramac_rows: int | None = None
    packages_found: int | None = None
    rows_unmapped: int | None = None
    rows_unverified: int | None = None
    report_period: str | None = None


class ReportTabs(BaseModel):
    package_time_summary: list[dict]
    unmapped_requires_review: list[dict]
    unverified_requires_review: list[dict]
    overall_activity_summary: list[dict]
    overall_by_user: list[dict]


class ReportResponse(BaseModel):
    report_id: int
    original_filename: str
    uploaded_at: dt.datetime
    processed_at: dt.datetime | None
    status: str
    stats: ReportStats
    tabs: ReportTabs

    @field_serializer("uploaded_at", "processed_at")
    def serialize_dt(self, v: dt.datetime | None) -> str | None:
        return _utc_iso(v)


class ReportListItem(BaseModel):
    report_id: int
    original_filename: str
    uploaded_at: dt.datetime
    processed_at: dt.datetime | None
    status: str
    report_period: str | None
    packages_found: int | None
    rows_unmapped: int | None
    rows_unverified: int | None

    @field_serializer("uploaded_at", "processed_at")
    def serialize_dt(self, v: dt.datetime | None) -> str | None:
        return _utc_iso(v)
