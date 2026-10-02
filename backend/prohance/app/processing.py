"""
Core Prohance -> Lauramac package-time processing logic.

This module contains no I/O beyond reading the uploaded CSV bytes: it takes
the raw file content in, and returns plain pandas DataFrames out. The API
layer (main.py) is responsible for persistence; the Excel-report script
(prohance_report.py) can also import this module directly if a standalone
.xlsx file is still needed alongside the API.

Sheet / tab naming is intentionally consistent:
    - "Unmapped - Requires Review"   -> activity with NO File # assigned at all
    - "Unverified - Requires Review" -> activity WITH a File # assigned, but
                                         never cross-checked against Lauramac
"""

from __future__ import annotations

import base64
import io
import re
import urllib.parse
from dataclasses import dataclass, field

import pandas as pd

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

MIN_LOAN_DIGITS = 5
PDF_CATEGORY_NAME = "PDF Reader"
LAURAMAC_ACTIVITY_NAME = "Lauramac"

LAURAMAC_URL_RE = re.compile(
    r"lauramac\.io/#/loans/viewloans/([^/?]+)/([^/?]+)", re.IGNORECASE
)
DIGIT_RUN_RE = re.compile(r"\d{%d,}" % MIN_LOAN_DIGITS)
LEADING_DIGIT_RUN_RE = re.compile(r"^\s*(\d{%d,})[\s_\-]" % MIN_LOAN_DIGITS)

UNMAPPED_LABEL = "Unmapped - Requires Review"
UNVERIFIED_LABEL = "Unverified - Requires Review"

# Tab keys returned by the API, in the order the UI should display them.
TAB_KEYS = [
    "package_time_summary",
    "unmapped_requires_review",
    "unverified_requires_review",
    "overall_activity_summary",
    "overall_by_user",
]


@dataclass
class ProcessingResult:
    package_summary: pd.DataFrame
    unmapped_review: pd.DataFrame
    unverified_review: pd.DataFrame
    overall_activity_summary: pd.DataFrame
    overall_by_user: pd.DataFrame
    stats: dict = field(default_factory=dict)

    def as_tabs(self) -> dict[str, pd.DataFrame]:
        return {
            "package_time_summary": self.package_summary,
            "unmapped_requires_review": self.unmapped_review,
            "unverified_requires_review": self.unverified_review,
            "overall_activity_summary": self.overall_activity_summary,
            "overall_by_user": self.overall_by_user,
        }


# --------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------

def load_prohance_csv(file_bytes: bytes) -> pd.DataFrame:
    """Parse a Prohance 'All Activities By User Details' export from raw
    bytes (as received from an HTTP upload). Automatically finds the real
    header row, skipping the "Report Period" / "Shifts" / "Time Zone"
    metadata lines Prohance puts at the top of every export.
    """
    text = file_bytes.decode("utf-8-sig", errors="replace")
    lines = text.splitlines(keepends=True)
    header_idx = next(
        i for i, line in enumerate(lines) if line.startswith("User Name,Session Date")
    )
    csv_body = "".join(lines[header_idx:])
    df = pd.read_csv(io.StringIO(csv_body), dtype=str)
    df.columns = [c.strip() for c in df.columns]
    return df


# --------------------------------------------------------------------------
# Duration handling
# --------------------------------------------------------------------------

def add_duration_seconds(df: pd.DataFrame) -> pd.DataFrame:
    start = pd.to_datetime(df["Start Time"], errors="coerce")
    end = pd.to_datetime(df["End Time"], errors="coerce")
    seconds = (end - start).dt.total_seconds()
    df["Duration (sec)"] = seconds.clip(lower=0).fillna(0)
    return df


def seconds_to_hms(seconds: float) -> str:
    seconds = int(round(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


# --------------------------------------------------------------------------
# Lauramac URL decoding
# --------------------------------------------------------------------------

def decode_b64_segment(segment: str) -> str | None:
    try:
        segment = urllib.parse.unquote(segment)
        padded = segment + "=" * (-len(segment) % 4)
        return base64.b64decode(padded).decode("utf-8", errors="ignore")
    except Exception:
        return None


def extract_lauramac_loan_number(activity_text) -> str | None:
    if not isinstance(activity_text, str):
        return None
    match = LAURAMAC_URL_RE.search(activity_text)
    if not match:
        return None
    decoded = decode_b64_segment(match.group(2))
    if decoded and decoded.isdigit():
        return decoded
    return None


# --------------------------------------------------------------------------
# PDF filename Loan Number extraction
# --------------------------------------------------------------------------

def extract_pdf_loan_candidates(activity_text) -> list[str]:
    if not isinstance(activity_text, str):
        return []
    return DIGIT_RUN_RE.findall(activity_text)


def leading_pdf_loan_candidate(activity_text) -> str | None:
    if not isinstance(activity_text, str):
        return None
    match = LEADING_DIGIT_RUN_RE.match(activity_text)
    return match.group(1) if match else None


# --------------------------------------------------------------------------
# Row classification + mapping
# --------------------------------------------------------------------------

def classify_rows(df: pd.DataFrame) -> pd.DataFrame:
    is_pdf = df["Category Name"].eq(PDF_CATEGORY_NAME)
    is_lauramac = df["Activity Name"].eq(LAURAMAC_ACTIVITY_NAME)
    row_type = pd.Series("OTHER", index=df.index)
    row_type[is_pdf] = "PDF"
    row_type[is_lauramac] = "LAURAMAC"
    df["Row Type"] = row_type
    return df


def build_known_loans_by_user(df: pd.DataFrame) -> dict[str, set[str]]:
    known: dict[str, set[str]] = {}
    lauramac_rows = df[df["Row Type"] == "LAURAMAC"]
    for user, loan in zip(lauramac_rows["User Name"], lauramac_rows["Lauramac Loan #"]):
        if loan:
            known.setdefault(user, set()).add(loan)
    return known


def assign_pdf_loan_numbers(df: pd.DataFrame, known_loans_by_user: dict[str, set[str]]) -> pd.DataFrame:
    file_numbers = []
    confidences = []
    pdf_mask = df["Row Type"] == "PDF"

    for _, row in df[pdf_mask].iterrows():
        text = row["Activity Text"]
        user = row["User Name"]
        candidates = extract_pdf_loan_candidates(text)
        known = known_loans_by_user.get(user, set())
        confirmed = sorted(set(candidates) & known)

        if len(confirmed) == 1:
            file_numbers.append(confirmed[0])
            confidences.append("Confirmed")
        elif len(confirmed) > 1:
            file_numbers.append(UNMAPPED_LABEL)
            confidences.append("Ambiguous - multiple Lauramac matches")
        else:
            leading = leading_pdf_loan_candidate(text)
            if leading:
                file_numbers.append(leading)
                confidences.append(UNVERIFIED_LABEL)
            elif candidates:
                file_numbers.append(candidates[0])
                confidences.append(UNVERIFIED_LABEL)
            else:
                file_numbers.append(UNMAPPED_LABEL)
                confidences.append("No Loan Number found in filename")

    df.loc[pdf_mask, "File #"] = file_numbers
    df.loc[pdf_mask, "Mapping Confidence"] = confidences
    return df


def finalize_file_numbers(df: pd.DataFrame) -> pd.DataFrame:
    lauramac_mask = df["Row Type"] == "LAURAMAC"
    df.loc[lauramac_mask, "File #"] = df.loc[lauramac_mask, "Lauramac Loan #"].apply(
        lambda x: x if x else UNMAPPED_LABEL
    )
    df.loc[lauramac_mask & (df["File #"] == UNMAPPED_LABEL), "Mapping Confidence"] = (
        "General Lauramac navigation (not package-specific)"
    )
    df.loc[lauramac_mask & (df["File #"] != UNMAPPED_LABEL), "Mapping Confidence"] = "Confirmed"

    other_mask = df["Row Type"] == "OTHER"
    df.loc[other_mask, "File #"] = ""
    df.loc[other_mask, "Mapping Confidence"] = ""
    return df


def _has_file_number(value: object) -> bool:
    return isinstance(value, str) and value != "" and value != UNMAPPED_LABEL


# --------------------------------------------------------------------------
# Report building
# --------------------------------------------------------------------------

def build_package_summary(df: pd.DataFrame) -> pd.DataFrame:
    mapped = df[
        df["Row Type"].isin(["PDF", "LAURAMAC"])
        & (df["File #"] != UNMAPPED_LABEL)
        & (df["File #"] != "")
    ].copy()

    pivot = (
        mapped.groupby(["File #", "User Name", "Session Date", "Row Type"])["Duration (sec)"]
        .sum()
        .unstack("Row Type", fill_value=0)
        .reset_index()
    )
    for col in ("PDF", "LAURAMAC"):
        if col not in pivot.columns:
            pivot[col] = 0.0

    pivot["Total Time (sec)"] = pivot["PDF"] + pivot["LAURAMAC"]
    pivot = pivot.rename(columns={"PDF": "PDF Time (sec)", "LAURAMAC": "Lauramac Time (sec)"})

    pivot["File Total (sec)"] = pivot.groupby("File #")["Total Time (sec)"].transform("sum")
    pivot["Users On File"] = pivot.groupby("File #")["User Name"].transform("nunique")

    for sec_col, label in [
        ("PDF Time (sec)", "PDF Time"),
        ("Lauramac Time (sec)", "Lauramac Time"),
        ("Total Time (sec)", "Total Time Spent On File"),
        ("File Total (sec)", "Total Time For File (All Users)"),
    ]:
        pivot[label] = pivot[sec_col].apply(seconds_to_hms)

    pivot = pivot.sort_values(
        ["File Total (sec)", "User Name", "Session Date"], ascending=[False, True, True]
    )

    return pivot[
        [
            "File #",
            "User Name",
            "Session Date",
            "PDF Time",
            "Lauramac Time",
            "Total Time Spent On File",
            "Users On File",
            "Total Time For File (All Users)",
            "PDF Time (sec)",
            "Lauramac Time (sec)",
            "Total Time (sec)",
            "File Total (sec)",
        ]
    ].reset_index(drop=True)


def build_unmapped_review(df: pd.DataFrame) -> pd.DataFrame:
    mask = (
        df["Row Type"].isin(["PDF", "LAURAMAC"])
        & ((df["File #"] == UNMAPPED_LABEL) | (df["File #"] == ""))
    )
    cols = [
        "User Name",
        "Session Date",
        "Row Type",
        "Category Name",
        "Activity Name",
        "Activity Text",
        "Process Name",
        "Start Time",
        "End Time",
        "Mapping Confidence",
    ]
    out = df.loc[mask, cols].copy()
    out["Duration (sec)"] = df.loc[mask, "Duration (sec)"]
    out["Duration"] = out["Duration (sec)"].apply(seconds_to_hms)
    out = out.rename(columns={"Mapping Confidence": "Reason"})
    return out.sort_values(["User Name", "Session Date", "Start Time"]).reset_index(drop=True)


def build_unverified_review(df: pd.DataFrame) -> pd.DataFrame:
    mask = df["Mapping Confidence"] == UNVERIFIED_LABEL
    cols = ["User Name", "Session Date", "File #", "Activity Text", "Start Time", "End Time"]
    out = df.loc[mask, cols].copy()
    out["Duration (sec)"] = df.loc[mask, "Duration (sec)"]
    out["Duration"] = out["Duration (sec)"].apply(seconds_to_hms)
    out["Reason"] = "No Lauramac visit found to confirm this File # for this user/day"
    return out.sort_values(["User Name", "Session Date", "Start Time"]).reset_index(drop=True)


def build_file_level_totals(df: pd.DataFrame) -> pd.DataFrame:
    mapped = df[
        df["Row Type"].isin(["PDF", "LAURAMAC"])
        & (df["File #"] != UNMAPPED_LABEL)
        & (df["File #"] != "")
    ]
    return mapped.groupby("File #").agg(
        **{
            "File Total (sec)": ("Duration (sec)", "sum"),
            "Users On File": ("User Name", "nunique"),
        }
    )


def _attach_file_totals(grouped: pd.DataFrame, file_totals: pd.DataFrame) -> pd.DataFrame:
    grouped = grouped.merge(file_totals, left_on="File #", right_index=True, how="left")
    grouped["Total Time For File (All Users)"] = grouped["File Total (sec)"].apply(
        lambda x: seconds_to_hms(x) if pd.notna(x) else ""
    )
    grouped["Users On File"] = grouped["Users On File"].apply(
        lambda x: int(x) if pd.notna(x) else None
    )
    return grouped


def _file_number_lookup_global(df: pd.DataFrame) -> dict[str, str]:
    mapped = df[df["File #"].apply(_has_file_number)]
    counts = (
        mapped.groupby(["Activity Text", "File #"]).size().reset_index(name="n")
        .sort_values("n", ascending=False)
    )
    return dict(counts.drop_duplicates("Activity Text").set_index("Activity Text")["File #"])


def _file_number_lookup_by_user(df: pd.DataFrame) -> dict[tuple[str, str], str]:
    mapped = df[df["File #"].apply(_has_file_number)]
    lookup: dict[tuple[str, str], str] = {}
    for user, text, loan in zip(mapped["User Name"], mapped["Activity Text"], mapped["File #"]):
        if isinstance(text, str):
            lookup[(user, text)] = loan
    return lookup


def build_overall_activity_summary(df: pd.DataFrame, file_totals: pd.DataFrame) -> pd.DataFrame:
    file_lookup = _file_number_lookup_global(df)
    review_texts = set(
        df.loc[
            df["Row Type"].isin(["PDF", "LAURAMAC"]) & ~df["File #"].apply(_has_file_number),
            "Activity Text",
        ].dropna()
    )

    grouped = (
        df.groupby(["Activity Name", "Activity Text"], dropna=False)["Duration (sec)"]
        .agg(["sum", "count"])
        .reset_index()
        .rename(columns={"sum": "Total Duration (sec)", "count": "Occurrences"})
    )
    grouped["File #"] = grouped["Activity Text"].map(file_lookup)
    no_file = grouped["File #"].isna()
    grouped.loc[no_file & grouped["Activity Text"].isin(review_texts), "File #"] = UNMAPPED_LABEL
    grouped["File #"] = grouped["File #"].fillna("")
    grouped["Total Time"] = grouped["Total Duration (sec)"].apply(seconds_to_hms)
    grouped = _attach_file_totals(grouped, file_totals)
    grouped = grouped.sort_values("Total Duration (sec)", ascending=False)
    return grouped[
        [
            "Activity Name",
            "Activity Text",
            "File #",
            "Occurrences",
            "Total Time",
            "Users On File",
            "Total Time For File (All Users)",
            "Total Duration (sec)",
        ]
    ].reset_index(drop=True)


def build_overall_by_user(df: pd.DataFrame, file_totals: pd.DataFrame) -> pd.DataFrame:
    file_lookup = _file_number_lookup_by_user(df)
    review_keys = set(
        map(
            tuple,
            df.loc[
                df["Row Type"].isin(["PDF", "LAURAMAC"]) & ~df["File #"].apply(_has_file_number),
                ["User Name", "Activity Text"],
            ].dropna().values,
        )
    )

    grouped = (
        df.groupby(["User Name", "Activity Name", "Activity Text"], dropna=False)["Duration (sec)"]
        .sum()
        .reset_index()
        .rename(columns={"Duration (sec)": "Total Duration (sec)"})
    )
    keys = list(zip(grouped["User Name"], grouped["Activity Text"]))
    grouped["File #"] = [file_lookup.get(k) for k in keys]
    no_file = grouped["File #"].isna()
    is_review_key = pd.Series([k in review_keys for k in keys], index=grouped.index)
    grouped.loc[no_file & is_review_key, "File #"] = UNMAPPED_LABEL
    grouped["File #"] = grouped["File #"].fillna("")
    grouped["Total Time"] = grouped["Total Duration (sec)"].apply(seconds_to_hms)
    grouped = _attach_file_totals(grouped, file_totals)
    grouped = grouped.sort_values(["User Name", "Total Duration (sec)"], ascending=[True, False])
    return grouped[
        [
            "User Name",
            "Activity Name",
            "Activity Text",
            "File #",
            "Total Time",
            "Users On File",
            "Total Time For File (All Users)",
            "Total Duration (sec)",
        ]
    ].reset_index(drop=True)


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

def process_prohance_csv(file_bytes: bytes) -> ProcessingResult:
    """Run the full pipeline on raw CSV bytes and return all 5 report
    DataFrames plus summary stats, ready to persist and/or serialize."""
    df = load_prohance_csv(file_bytes)
    df = add_duration_seconds(df)
    df = classify_rows(df)

    df["Lauramac Loan #"] = df["Activity Text"].where(df["Row Type"] == "LAURAMAC").apply(
        extract_lauramac_loan_number
    )

    known_loans_by_user = build_known_loans_by_user(df)
    df = assign_pdf_loan_numbers(df, known_loans_by_user)
    df = finalize_file_numbers(df)

    package_summary = build_package_summary(df)
    unmapped_review = build_unmapped_review(df)
    unverified_review = build_unverified_review(df)
    file_totals = build_file_level_totals(df)
    overall_activity_summary = build_overall_activity_summary(df, file_totals)
    overall_by_user = build_overall_by_user(df, file_totals)

    stats = {
        "rows_processed": int(len(df)),
        "pdf_rows": int((df["Row Type"] == "PDF").sum()),
        "lauramac_rows": int((df["Row Type"] == "LAURAMAC").sum()),
        "packages_found": int(package_summary["File #"].nunique()),
        "rows_unmapped": int(len(unmapped_review)),
        "rows_unverified": int(len(unverified_review)),
        "report_period": (
            str(df["Session Date"].iloc[0]) if "Session Date" in df.columns and len(df) else None
        ),
    }

    return ProcessingResult(
        package_summary=package_summary,
        unmapped_review=unmapped_review,
        unverified_review=unverified_review,
        overall_activity_summary=overall_activity_summary,
        overall_by_user=overall_by_user,
        stats=stats,
    )
