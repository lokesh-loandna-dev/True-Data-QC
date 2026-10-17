"""
Translates between the pandas-based ProcessingResult and the SQL Server
tables. Kept separate from main.py so the persistence shape can evolve
without touching the API route logic.
"""

from __future__ import annotations

import datetime as dt

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .processing import ProcessingResult, seconds_to_hms


import math


def _safe_str(value) -> str | None:
    if value is None or pd.isna(value):
        return None
    s = str(value)
    if s.lower() in ("nan", "<na>", "none", "null"):
        return None
    return s


def _safe_float(value) -> float | None:
    if value is None or pd.isna(value):
        return None
    try:
        val = float(value)
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    except (TypeError, ValueError):
        return None


def _safe_int(value) -> int | None:
    if value is None or pd.isna(value):
        return None
    try:
        val = float(value)
        if math.isnan(val) or math.isinf(val):
            return None
        return int(val)
    except (TypeError, ValueError):
        return None


def save_report(
    db: Session,
    original_filename: str,
    raw_file_content: bytes,
    result: ProcessingResult,
) -> models.ProhanceReport:
    """Persist the uploaded file + all 5 processed tabs in one transaction."""

    report = models.ProhanceReport(
        original_filename=original_filename,
        raw_file_content=raw_file_content,
        report_period=result.stats.get("report_period"),
        uploaded_at=dt.datetime.now(dt.timezone.utc).replace(tzinfo=None),
        processed_at=dt.datetime.now(dt.timezone.utc).replace(tzinfo=None),
        status="COMPLETED",
        rows_processed=result.stats.get("rows_processed"),
        pdf_rows=result.stats.get("pdf_rows"),
        lauramac_rows=result.stats.get("lauramac_rows"),
        packages_found=result.stats.get("packages_found"),
        rows_unmapped=result.stats.get("rows_unmapped"),
        rows_unverified=result.stats.get("rows_unverified"),
    )
    db.add(report)
    db.flush()  # assigns report.id without committing yet

    report.package_summary_rows = [
        models.PackageSummary(
            report_id=report.id,
            file_number=_safe_str(r.get("File #")) or "",
            user_name=_safe_str(r.get("User Name")) or "",
            session_date=_safe_str(r.get("Session Date")) or "",
            pdf_time_sec=_safe_float(r.get("PDF Time (sec)")) or 0.0,
            lauramac_time_sec=_safe_float(r.get("Lauramac Time (sec)")) or 0.0,
            total_time_sec=_safe_float(r.get("Total Time (sec)")) or 0.0,
            users_on_file=_safe_int(r.get("Users On File")) or 0,
            file_total_sec=_safe_float(r.get("File Total (sec)")) or 0.0,
        )
        for r in result.package_summary.to_dict(orient="records")
    ]

    report.unmapped_rows = [
        models.UnmappedReview(
            report_id=report.id,
            user_name=_safe_str(r.get("User Name")) or "",
            session_date=_safe_str(r.get("Session Date")) or "",
            row_type=_safe_str(r.get("Row Type")) or "",
            category_name=_safe_str(r.get("Category Name")),
            activity_name=_safe_str(r.get("Activity Name")),
            activity_text=_safe_str(r.get("Activity Text")),
            process_name=_safe_str(r.get("Process Name")),
            start_time=_safe_str(r.get("Start Time")),
            end_time=_safe_str(r.get("End Time")),
            duration_sec=_safe_float(r.get("Duration (sec)")) or 0.0,
            reason=_safe_str(r.get("Reason")),
        )
        for r in result.unmapped_review.to_dict(orient="records")
    ]

    report.unverified_rows = [
        models.UnverifiedReview(
            report_id=report.id,
            user_name=_safe_str(r.get("User Name")) or "",
            session_date=_safe_str(r.get("Session Date")) or "",
            file_number=_safe_str(r.get("File #")),
            activity_text=_safe_str(r.get("Activity Text")),
            start_time=_safe_str(r.get("Start Time")),
            end_time=_safe_str(r.get("End Time")),
            duration_sec=_safe_float(r.get("Duration (sec)")) or 0.0,
            reason=_safe_str(r.get("Reason")),
        )
        for r in result.unverified_review.to_dict(orient="records")
    ]

    report.overall_activity_rows = [
        models.OverallActivitySummary(
            report_id=report.id,
            activity_name=_safe_str(r.get("Activity Name")),
            activity_text=_safe_str(r.get("Activity Text")),
            file_number=_safe_str(r.get("File #")),
            occurrences=_safe_int(r.get("Occurrences")) or 0,
            total_duration_sec=_safe_float(r.get("Total Duration (sec)")) or 0.0,
            users_on_file=_safe_int(r.get("Users On File")),
            file_total_sec=_safe_float(r.get("File Total (sec)")),
        )
        for r in result.overall_activity_summary.to_dict(orient="records")
    ]

    report.overall_by_user_rows = [
        models.OverallByUser(
            report_id=report.id,
            user_name=_safe_str(r.get("User Name")) or "",
            activity_name=_safe_str(r.get("Activity Name")),
            activity_text=_safe_str(r.get("Activity Text")),
            file_number=_safe_str(r.get("File #")),
            total_duration_sec=_safe_float(r.get("Total Duration (sec)")) or 0.0,
            users_on_file=_safe_int(r.get("Users On File")),
            file_total_sec=_safe_float(r.get("File Total (sec)")),
        )
        for r in result.overall_by_user.to_dict(orient="records")
    ]

    db.commit()
    db.refresh(report)
    return report


def load_report(db: Session, report_id: int) -> models.ProhanceReport | None:
    return db.get(models.ProhanceReport, report_id)


def list_reports(db: Session, limit: int = 50) -> list[models.ProhanceReport]:
    stmt = (
        select(models.ProhanceReport)
        .order_by(models.ProhanceReport.uploaded_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt))


def delete_report(db: Session, report_id: int) -> bool:
    """Delete a ProhanceReport; child rows removed by ON DELETE CASCADE FK constraints."""
    report = (
        db.query(models.ProhanceReport)
        .filter(models.ProhanceReport.id == report_id)
        .with_for_update()
        .first()
    )
    if report is None:
        return False
    db.delete(report)
    db.commit()
    return True


def delete_all_reports(db: Session) -> int:
    """Delete all ProhanceReport entries; child rows removed by ON DELETE CASCADE FK constraints."""
    count = db.query(models.ProhanceReport).count()
    db.query(models.ProhanceReport).delete(synchronize_session=False)
    db.commit()
    return count



# --------------------------------------------------------------------------
# Serialization helpers: ORM rows -> the same JSON shape the API returns
# for a freshly-processed (not-yet-persisted) report.
# --------------------------------------------------------------------------

def package_summary_to_dicts(rows: list[models.PackageSummary]) -> list[dict]:
    return [
        {
            "File #": r.file_number,
            "User Name": r.user_name,
            "Session Date": r.session_date,
            "PDF Time": seconds_to_hms(r.pdf_time_sec),
            "Lauramac Time": seconds_to_hms(r.lauramac_time_sec),
            "Total Time Spent On File": seconds_to_hms(r.total_time_sec),
            "Users On File": r.users_on_file,
            "Total Time For File (All Users)": seconds_to_hms(r.file_total_sec),
        }
        for r in rows
    ]


def unmapped_review_to_dicts(rows: list[models.UnmappedReview]) -> list[dict]:
    return [
        {
            "User Name": r.user_name,
            "Session Date": r.session_date,
            "Row Type": r.row_type,
            "Category Name": r.category_name,
            "Activity Name": r.activity_name,
            "Activity Text": r.activity_text,
            "Process Name": r.process_name,
            "Start Time": r.start_time,
            "End Time": r.end_time,
            "Duration": seconds_to_hms(r.duration_sec),
            "Reason": r.reason,
        }
        for r in rows
    ]


def unverified_review_to_dicts(rows: list[models.UnverifiedReview]) -> list[dict]:
    return [
        {
            "User Name": r.user_name,
            "Session Date": r.session_date,
            "File #": r.file_number,
            "Activity Text": r.activity_text,
            "Start Time": r.start_time,
            "End Time": r.end_time,
            "Duration": seconds_to_hms(r.duration_sec),
            "Reason": r.reason,
        }
        for r in rows
    ]


def overall_activity_summary_to_dicts(rows: list[models.OverallActivitySummary]) -> list[dict]:
    return [
        {
            "Activity Name": r.activity_name,
            "Activity Text": r.activity_text,
            "File #": r.file_number or "",
            "Occurrences": r.occurrences,
            "Total Time": seconds_to_hms(r.total_duration_sec),
            "Users On File": r.users_on_file,
            "Total Time For File (All Users)": (
                seconds_to_hms(r.file_total_sec) if r.file_total_sec is not None else ""
            ),
        }
        for r in rows
    ]


def overall_by_user_to_dicts(rows: list[models.OverallByUser]) -> list[dict]:
    return [
        {
            "User Name": r.user_name,
            "Activity Name": r.activity_name,
            "Activity Text": r.activity_text,
            "File #": r.file_number or "",
            "Total Time": seconds_to_hms(r.total_duration_sec),
            "Users On File": r.users_on_file,
            "Total Time For File (All Users)": (
                seconds_to_hms(r.file_total_sec) if r.file_total_sec is not None else ""
            ),
        }
        for r in rows
    ]
