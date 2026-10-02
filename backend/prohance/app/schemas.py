from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


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
