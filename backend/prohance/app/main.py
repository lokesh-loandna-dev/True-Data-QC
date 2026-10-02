from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, FastAPI, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from . import repository, schemas
from .database import get_db, init_db
from .processing import ProcessingResult, process_prohance_csv

router = APIRouter(prefix="/api/prohance", tags=["prohance"])

app = FastAPI(
    title="Prohance Package Time Reporting API",
    version="1.0.0",
    description=(
        "Uploads a Prohance activity export, maps every PDF/Lauramac "
        "action to its underlying loan package, and returns package-level "
        "and org-wide time summaries for a 5-tab dashboard."
    ),
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


_SEC_COLUMNS_TO_DROP = [
    "PDF Time (sec)",
    "Lauramac Time (sec)",
    "Total Time (sec)",
    "File Total (sec)",
    "Total Duration (sec)",
    "Duration (sec)",
]


import math
import pandas as pd


def _clean_val(val):
    if val is None or pd.isna(val):
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    s = str(val)
    if s.lower() == "nan":
        return None
    return val


def _clean_records(records: list[dict]) -> list[dict]:
    return [{k: _clean_val(v) for k, v in rec.items()} for rec in records]


def _clean(df):
    return df.drop(columns=[c for c in _SEC_COLUMNS_TO_DROP if c in df.columns])


def _result_to_tabs(result: ProcessingResult) -> dict:
    return {
        "package_time_summary": _clean_records(_clean(result.package_summary).to_dict(orient="records")),
        "unmapped_requires_review": _clean_records(_clean(result.unmapped_review).to_dict(orient="records")),
        "unverified_requires_review": _clean_records(_clean(result.unverified_review).to_dict(orient="records")),
        "overall_activity_summary": _clean_records(_clean(result.overall_activity_summary).to_dict(orient="records")),
        "overall_by_user": _clean_records(_clean(result.overall_by_user).to_dict(orient="records")),
    }


@router.post("/reports", response_model=schemas.ReportResponse)
async def upload_and_process_report(
    file: UploadFile,
    db: Session = Depends(get_db),
):
    """Upload a Prohance CSV export -> process it -> persist it -> return
    the processed data for all 5 UI tabs in one response."""
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv export from Prohance.")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        result = process_prohance_csv(raw_bytes)
    except StopIteration:
        raise HTTPException(
            status_code=422,
            detail="Could not find the expected header row ('User Name,Session Date,...') "
            "in this file - is it a Prohance 'All Activities By User Details' export?",
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Failed to process file: {exc}")

    report = repository.save_report(
        db=db,
        original_filename=file.filename,
        raw_file_content=raw_bytes,
        result=result,
    )

    return schemas.ReportResponse(
        report_id=report.id,
        original_filename=report.original_filename,
        uploaded_at=report.uploaded_at,
        processed_at=report.processed_at,
        status=report.status,
        stats=schemas.ReportStats(**result.stats),
        tabs=schemas.ReportTabs(**_result_to_tabs(result)),
    )


@router.get("/reports", response_model=list[schemas.ReportListItem])
def list_reports(limit: int = 50, db: Session = Depends(get_db)):
    """List past reports, most recent first - for a report-history picker."""
    reports = repository.list_reports(db, limit=limit)
    return [
        schemas.ReportListItem(
            report_id=r.id,
            original_filename=r.original_filename,
            uploaded_at=r.uploaded_at,
            processed_at=r.processed_at,
            status=r.status,
            report_period=r.report_period,
            packages_found=r.packages_found,
            rows_unmapped=r.rows_unmapped,
            rows_unverified=r.rows_unverified,
        )
        for r in reports
    ]


@router.get("/reports/{report_id}", response_model=schemas.ReportResponse)
def get_report(report_id: int, db: Session = Depends(get_db)):
    """Re-fetch a previously processed report's 5 tabs from SQL Server."""
    report = repository.load_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found.")

    tabs = schemas.ReportTabs(
        package_time_summary=repository.package_summary_to_dicts(report.package_summary_rows),
        unmapped_requires_review=repository.unmapped_review_to_dicts(report.unmapped_rows),
        unverified_requires_review=repository.unverified_review_to_dicts(report.unverified_rows),
        overall_activity_summary=repository.overall_activity_summary_to_dicts(
            report.overall_activity_rows
        ),
        overall_by_user=repository.overall_by_user_to_dicts(report.overall_by_user_rows),
    )

    return schemas.ReportResponse(
        report_id=report.id,
        original_filename=report.original_filename,
        uploaded_at=report.uploaded_at,
        processed_at=report.processed_at,
        status=report.status,
        stats=schemas.ReportStats(
            rows_processed=report.rows_processed,
            pdf_rows=report.pdf_rows,
            lauramac_rows=report.lauramac_rows,
            packages_found=report.packages_found,
            rows_unmapped=report.rows_unmapped,
            rows_unverified=report.rows_unverified,
            report_period=report.report_period,
        ),
        tabs=tabs,
    )


@router.get("/reports/{report_id}/raw-file")
def download_raw_file(report_id: int, db: Session = Depends(get_db)):
    """Download the original uploaded CSV, exactly as received."""
    report = repository.load_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found.")
    return Response(
        content=report.raw_file_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{report.original_filename}"'},
    )


@router.delete("/reports")
def delete_all_reports(db: Session = Depends(get_db)):
    count = repository.delete_all_reports(db)
    return {"status": "success", "message": f"Deleted all {count} report(s) successfully", "count": count}


@router.delete("/reports/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db)):
    success = repository.delete_report(db, report_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found.")
    return {"status": "success", "message": f"Report {report_id} deleted successfully"}


app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok", "time": dt.datetime.utcnow().isoformat()}
