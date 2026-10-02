from __future__ import annotations

import datetime as dt

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class ProhanceReport(Base):
    """One row per uploaded Prohance export. Holds the raw file (so the
    original input is preserved in SQL Server, per requirement) plus
    processing metadata/stats used to populate a reports history list."""

    __tablename__ = "prohance_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    original_filename: Mapped[str] = mapped_column(String(500))
    raw_file_content: Mapped[bytes] = mapped_column(LargeBinary)  # original CSV, verbatim
    report_period: Mapped[str | None] = mapped_column(String(50), nullable=True)

    uploaded_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)
    processed_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="PROCESSING")  # PROCESSING/COMPLETED/FAILED
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    rows_processed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pdf_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lauramac_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    packages_found: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rows_unmapped: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rows_unverified: Mapped[int | None] = mapped_column(Integer, nullable=True)

    package_summary_rows: Mapped[list["PackageSummary"]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )
    unmapped_rows: Mapped[list["UnmappedReview"]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )
    unverified_rows: Mapped[list["UnverifiedReview"]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )
    overall_activity_rows: Mapped[list["OverallActivitySummary"]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )
    overall_by_user_rows: Mapped[list["OverallByUser"]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )


class PackageSummary(Base):
    """Tab 1: Package Time Summary."""

    __tablename__ = "prohance_package_summary"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("prohance_reports.id", ondelete="CASCADE"), index=True)

    file_number: Mapped[str] = mapped_column(String(50), index=True)
    user_name: Mapped[str] = mapped_column(String(200))
    session_date: Mapped[str] = mapped_column(String(50))  # kept as source text (e.g. "12 Aug 2026")

    pdf_time_sec: Mapped[float] = mapped_column(Float)
    lauramac_time_sec: Mapped[float] = mapped_column(Float)
    total_time_sec: Mapped[float] = mapped_column(Float)
    users_on_file: Mapped[int] = mapped_column(Integer)
    file_total_sec: Mapped[float] = mapped_column(Float)

    report: Mapped["ProhanceReport"] = relationship(back_populates="package_summary_rows")


class UnmappedReview(Base):
    """Tab 2: Unmapped - Requires Review."""

    __tablename__ = "prohance_unmapped_review"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("prohance_reports.id", ondelete="CASCADE"), index=True)

    user_name: Mapped[str] = mapped_column(String(200))
    session_date: Mapped[str] = mapped_column(String(50))
    row_type: Mapped[str] = mapped_column(String(20))
    category_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    activity_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    activity_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    process_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    start_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    end_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    duration_sec: Mapped[float] = mapped_column(Float)
    reason: Mapped[str | None] = mapped_column(String(200), nullable=True)

    report: Mapped["ProhanceReport"] = relationship(back_populates="unmapped_rows")


class UnverifiedReview(Base):
    """Tab 3: Unverified - Requires Review."""

    __tablename__ = "prohance_unverified_review"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("prohance_reports.id", ondelete="CASCADE"), index=True)

    user_name: Mapped[str] = mapped_column(String(200))
    session_date: Mapped[str] = mapped_column(String(50))
    file_number: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    activity_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    end_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    duration_sec: Mapped[float] = mapped_column(Float)
    reason: Mapped[str | None] = mapped_column(String(300), nullable=True)

    report: Mapped["ProhanceReport"] = relationship(back_populates="unverified_rows")


class OverallActivitySummary(Base):
    """Tab 4: Overall Activity Summary (org-wide)."""

    __tablename__ = "prohance_overall_activity_summary"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("prohance_reports.id", ondelete="CASCADE"), index=True)

    activity_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    activity_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_number: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    occurrences: Mapped[int] = mapped_column(Integer)
    total_duration_sec: Mapped[float] = mapped_column(Float)
    users_on_file: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_total_sec: Mapped[float | None] = mapped_column(Float, nullable=True)

    report: Mapped["ProhanceReport"] = relationship(back_populates="overall_activity_rows")


class OverallByUser(Base):
    """Tab 5: Overall by User."""

    __tablename__ = "prohance_overall_by_user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("prohance_reports.id", ondelete="CASCADE"), index=True)

    user_name: Mapped[str] = mapped_column(String(200), index=True)
    activity_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    activity_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_number: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    total_duration_sec: Mapped[float] = mapped_column(Float)
    users_on_file: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_total_sec: Mapped[float | None] = mapped_column(Float, nullable=True)

    report: Mapped["ProhanceReport"] = relationship(back_populates="overall_by_user_rows")
