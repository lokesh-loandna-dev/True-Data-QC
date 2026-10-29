#!/usr/bin/env python3
"""
Validate loan sample files against a data dictionary.

For every sample file in an input folder this script appends validation columns
and writes the annotated copy to an output folder:

    Dictionary Match Status   Matched / Unmatched
    Data Type Validation      TRUE / FALSE / N/A - <reason>
    Data Type Remarks         why a type check failed (blank when it passed)
    Enum Validation           TRUE / TRUE - format variance / FALSE / N/A - <reason>
    Enum Remarks              why an enum check failed or was coerced
    Macro Validation Result   translated VBA Module 1 business-rule result
    Result                    combined final result for the row

Usage
-----
    python validate_loan_files.py --input-dir ./samples \
                                  --dict ./data_dictionary.xlsx \
                                  --output-dir ./output

    # single file
    python validate_loan_files.py --input-dir ./samples/Sample_7.xlsx \
                                  --dict ./dict.xlsx --output-dir ./output

Options
-------
    --strict-enums   treat space/case-only differences as FALSE instead of
                     "TRUE - format variance"
    --blank-as-fail  treat blank values as FALSE instead of N/A
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from copy import copy
from datetime import date, datetime, timedelta
from pathlib import Path

import openpyxl
import pandas as pd

# This file's own version. REQUIRED_CONDITION_VERSION below says which parser
# it needs -- the two are different things, and only this one identifies the
# build you are running.
__version__ = "5.12.0"

REQUIRED_CONDITION_VERSION = "5.12.0"

try:
    import condition_validation as conditions
except ImportError:
    try:
        from lm_helper import condition_validation as conditions
    except ImportError:
        try:
            from . import condition_validation as conditions
        except ImportError:
            conditions = None


def check_condition_module_version() -> bool:
    """Warn if condition_validation.py is older than this build expects."""
    if conditions is None:
        return True
    found = getattr(conditions, "__version__", None)
    if found is None:
        log.error(
            "condition_validation.py declares no __version__; expected %s. "
            "This copy predates version checking - replace it before "
            "trusting condition results.", REQUIRED_CONDITION_VERSION)
        return False
    if _version_tuple(found) < _version_tuple(REQUIRED_CONDITION_VERSION):
        log.error(
            "condition_validation.py is version %s but this build expects "
            "%s or newer. Condition results will differ. Update the file.",
            found, REQUIRED_CONDITION_VERSION)
        return False
    if _version_tuple(found) > _version_tuple(REQUIRED_CONDITION_VERSION):
        log.warning(
            "condition_validation.py is version %s, newer than the %s this "
            "build was tested against. Results may differ from expectations.",
            found, REQUIRED_CONDITION_VERSION)
    return True


def _version_tuple(text):
    parts = []
    for chunk in str(text).split("."):
        digits = "".join(c for c in chunk if c.isdigit())
        parts.append(int(digits) if digits else 0)
    return tuple(parts)
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

# Column names in the SAMPLE file
SAMPLE_LABEL_COL = "Data Label"      # camelCase code, join key
SAMPLE_NAME_COL = "Data Field"       # human-readable name
SAMPLE_VALUE_COL = "True Data"       # value to validate
SAMPLE_LOAN_ID_COL = "Loan ID"       # optional grouping key

# Column names in the DICTIONARY file.
# NOTE: the dictionary reverses the intuitive naming -- "Field Name" holds the
# human-readable name and "Field Label" holds the camelCase code.
DICT_LABEL_COL = "Field Label"
DICT_TYPE_COL = "Data Type"
DICT_ENUM_COL = "Field Enumerations"

# The first eight columns are produced by the original pipeline and are NOT
# affected by condition validation. The condition columns are appended after
# them so existing rules, ordering and downstream consumers stay intact.
BASE_COLUMNS = [
    "Dictionary Match Status",
    "Data Type Validation",
    "Data Type Remarks",
    "Numeric Format Flag",
    "Enum Validation",
    "Enum Remarks",
    "Macro Validation Result",
    "Result",
]

CONDITION_COLUMNS = [
    "Condition Validation",
    "Condition Rule Type",
    "Condition Remarks",
    # The rule as the business team wrote it, plus a verdict per clause, so a
    # "Valid - partial" row shows which clause passed and which did not.
    "Condition Text",
    "Condition Outcome",
]

# Consolidated view for the UI: one verdict and one remark per field, so the
# intermediate columns can be hidden by default.
FINAL_COLUMNS = [
    "Final Result",
    "Final Remarks",
]

NEW_COLUMNS = BASE_COLUMNS + CONDITION_COLUMNS + FINAL_COLUMNS

# A well-formed numeric core: either plain digits or correctly grouped
# thousands, with at most one decimal part. Anchored, so trailing junk fails.
CANONICAL_NUMBER = re.compile(r"^[+-]?(\d+|\d{1,3}(,\d{3})+)(\.\d+)?$")

DATE_FORMATS = [
    "%m-%d-%Y", "%m/%d/%Y", "%Y-%m-%d", "%Y/%m/%d",
    "%m-%d-%y", "%m/%d/%y", "%d-%b-%Y", "%d %b %Y", "%b %d, %Y",
    "%Y%m%d",
]

BOOLEAN_TOKENS = {"true", "false", "yes", "no", "y", "n", "0", "1", "t", "f"}

SAMPLE_EXTENSIONS = {".xlsx", ".xlsm", ".xls", ".csv"}

# Fills used for the appended columns
FILL_PASS = PatternFill("solid", fgColor="C6EFCE")   # green
FILL_FAIL = PatternFill("solid", fgColor="FFC7CE")   # red
FILL_WARN = PatternFill("solid", fgColor="FFEB9C")   # amber
FILL_NA = PatternFill("solid", fgColor="EDEDED")     # grey

log = logging.getLogger("validate")


# --------------------------------------------------------------------------- #
# Value helpers
# --------------------------------------------------------------------------- #

def is_blank(value) -> bool:
    """True for None, NaN, empty string, or whitespace-only string."""
    if value is None:
        return True
    if isinstance(value, float) and pd.isna(value):
        return True
    return str(value).strip() == ""


def normalize(text) -> str:
    """Lowercase and strip every non-alphanumeric character."""
    return re.sub(r"[^a-z0-9]", "", str(text).lower())


def strip_numeric_decoration(text: str) -> str:
    """Remove currency symbols, thousands separators, percent signs, and
    accounting-style parentheses so the remainder can be parsed as a number."""
    s = str(text).strip()
    s = s.replace(",", "").replace("$", "").replace("%", "").replace("\u00a0", "")
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1].strip()
    return s


def split_multivalue(value) -> list[str]:
    """Split a possibly multi-valued cell into atomic values.

    Multi-select enum fields are stored as JSON arrays, e.g.
    '["2024","2025","2026"]'. Single values are returned as a one-item list.
    """
    text = str(value).strip()
    if text.startswith("[") and text.endswith("]"):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except json.JSONDecodeError:
            inner = text[1:-1]
            return [p.strip().strip('"').strip("'")
                    for p in inner.split(",") if p.strip()]
    return [text]


def parse_enum_list(raw) -> list[str] | None:
    """Parse the newline-delimited allowed-values list. None if not defined."""
    if is_blank(raw):
        return None
    parts = re.split(r"[\r\n]+", str(raw))
    seen, out = set(), []
    for part in parts:
        cleaned = part.strip()
        if cleaned and cleaned not in seen:      # dictionary has duplicates
            seen.add(cleaned)
            out.append(cleaned)
    return out or None


# --------------------------------------------------------------------------- #
# Validators
# --------------------------------------------------------------------------- #

def inspect_numeric_format(value, strict=False):
    """Examine an amount BEFORE any decoration is stripped.

    Catches malformations that lenient parsing would silently repair, e.g.
    '15.34,,' -> '15.34'. Returns (flag, remark); flag is "" when there is
    nothing to report.

    strict=True also flags otherwise-legal decoration ($ signs, thousands
    separators, percent, accounting parentheses).
    """
    # Native numeric cells carry no formatting, so there is nothing to inspect.
    if isinstance(value, bool):
        return "", ""
    if isinstance(value, (int, float)):
        return "", ""

    raw = str(value).strip()
    if raw == "":
        return "", ""

    core = raw
    decoration = []

    if core.startswith("(") and core.endswith(")"):
        core = core[1:-1].strip()
        decoration.append("accounting parentheses")
    for symbol in ("$", "\u00a3", "\u20ac"):
        if core.startswith(symbol):
            core = core[len(symbol):].strip()
            decoration.append("currency symbol")
    if core.endswith("%"):
        core = core[:-1].strip()
        decoration.append("percent sign")
    if "," in core:
        decoration.append("thousands separators")

    # Specific, nameable malformations, checked most-recognisable first.
    integer_part, _, decimal_part = core.partition(".")

    if core.count(".") > 1:
        return ("FLAGGED - multiple decimal points",
                f"Amount {raw!r} contains {core.count('.')} decimal points; "
                f"not a valid number.")
    if "," in decimal_part:
        return ("FLAGGED - comma after decimal",
                f"Amount {raw!r} has comma(s) after the decimal point. The "
                f"digits following the decimal must be unpunctuated.")
    if ",," in core:
        return ("FLAGGED - consecutive commas",
                f"Amount {raw!r} contains consecutive commas.")
    if core.endswith(",") or core.endswith("."):
        return ("FLAGGED - trailing separator",
                f"Amount {raw!r} ends with a separator character.")
    if core.startswith(","):
        return ("FLAGGED - leading comma",
                f"Amount {raw!r} starts with a comma.")
    if re.search(r"\s", core):
        return ("FLAGGED - embedded whitespace",
                f"Amount {raw!r} contains whitespace inside the number.")

    if not CANONICAL_NUMBER.match(core):
        if "," in integer_part and re.fullmatch(r"[+-]?[\d,]+", integer_part):
            return ("FLAGGED - incorrect thousands grouping",
                    f"Amount {raw!r} has commas that do not form valid "
                    f"three-digit groups.")
        if re.search(r"[^\d,.+-]", core):
            stray = "".join(sorted({c for c in core if not c.isdigit()
                                    and c not in ",.+-"}))
            return ("FLAGGED - non-numeric characters",
                    f"Amount {raw!r} contains non-numeric character(s): "
                    f"{stray!r}.")
        return ("FLAGGED - not a valid number",
                f"Amount {raw!r} is not a valid numeric value.")

    # Well formed, but it arrived as text rather than a number.
    if strict and decoration:
        return ("FLAGGED - formatted as text",
                f"Amount {raw!r} is stored as text with "
                f"{', '.join(sorted(set(decoration)))}; expected a plain "
                f"numeric value.")
    if decoration:
        return ("OK - decorated text",
                f"Amount {raw!r} is stored as text with "
                f"{', '.join(sorted(set(decoration)))}. Parsed successfully.")
    return ("OK - numeric text",
            f"Amount {raw!r} is stored as text rather than a number.")


def validate_data_type(value, data_type):
    """Return (status, remark) for a type check.

    status is "TRUE", "FALSE", or "N/A - <reason>"; remark is "" when passing.
    """
    if is_blank(data_type):
        return "N/A - no data type in dictionary", ""

    dtype = str(data_type).strip()
    raw = str(value).strip()

    if dtype == "Boolean":
        if raw.lower() in BOOLEAN_TOKENS:
            return "TRUE", ""
        return "FALSE", (
            f"Expected Boolean; value {raw!r} is not a recognised boolean "
            f"(true/false/yes/no/1/0)."
        )

    if dtype in ("Number", "Integer"):
        # Inspect the raw text first: lenient stripping would otherwise
        # silently repair values like '15.34,,' into '15.34'.
        flag, detail = inspect_numeric_format(value)
        if flag.startswith("FLAGGED"):
            return "FALSE", f"Expected {dtype}; {detail}"

        candidate = strip_numeric_decoration(raw)
        try:
            number = float(candidate)
        except ValueError:
            return "FALSE", f"Expected {dtype}; value {raw!r} is not numeric."

        if dtype == "Integer" and number != int(number):
            return "FALSE", (
                f"Expected Integer; value {raw!r} has a fractional component. "
                f"Confirm whether the dictionary type should be Number."
            )
        return "TRUE", ""

    if dtype == "Date":
        if isinstance(value, (datetime, date)):
            return "TRUE", ""
        for fmt in DATE_FORMATS:
            try:
                datetime.strptime(raw, fmt)
                return "TRUE", ""
            except ValueError:
                continue
        return "FALSE", (
            f"Expected Date; value {raw!r} does not match a recognised format "
            f"(MM-DD-YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-Mon-YYYY)."
        )

    if dtype in ("Text", "Array"):
        return "TRUE", ""          # any non-blank scalar is valid text

    if dtype == "Enumeration":
        # Membership is the enum check's job; type alone is always satisfied.
        return "TRUE", ""

    return f"N/A - unrecognised data type {dtype!r}", ""


def validate_enum(value, data_type, raw_enums, strict=False):
    """Return (status, remark) for an enum membership check."""
    if is_blank(data_type) or str(data_type).strip() != "Enumeration":
        return "N/A - not an enum field", ""

    allowed = parse_enum_list(raw_enums)
    if allowed is None:
        return "N/A - no enum list defined", (
            "Field is typed Enumeration but the dictionary defines no allowed "
            "values; cannot validate."
        )

    parts = split_multivalue(value)
    exact = set(allowed)
    by_norm = {normalize(a): a for a in allowed}
    preview = " | ".join(allowed[:12]) + (" | ..." if len(allowed) > 12 else "")

    unmatched = [p for p in parts if p not in exact]
    if not unmatched:
        return "TRUE", ""

    # Which of the unmatched values differ only by case/spacing?
    coerced, truly_bad = [], []
    for part in unmatched:
        target = by_norm.get(normalize(part))
        if target is None:
            truly_bad.append(part)
        else:
            coerced.append((part, target))

    if truly_bad:
        listed = ", ".join(repr(p) for p in truly_bad)
        plural = "values" if len(truly_bad) > 1 else "value"
        return "FALSE", (
            f"{plural.capitalize()} {listed} not in allowed list: {preview}"
        )

    # Everything resolved after normalisation.
    detail = "; ".join(f"{p!r} -> {t!r}" for p, t in coerced)
    remark = (
        f"Matches allowed value only after ignoring case/spacing ({detail}). "
        f"Value formatting differs from the dictionary."
    )
    if strict:
        return "FALSE", remark
    return "TRUE - format variance", remark


# --------------------------------------------------------------------------- #
# VBA Module 1 business-rule validation (Python translation)
# --------------------------------------------------------------------------- #

STANDARD_DATE_FIELDS = {
    "Borrower 1 Final Signature Date",
    "Notary Acknowledgment Date",
    "Closing - Settlement Date",
    "Note Date",
    "Cash Disbursement Date",
}

DATE_RANGE_FIELD_FRAGMENTS = (
    "FHA Case Number Assignment Date",
    "HCM Disclosure Date",
    "HCM Preloan Counseling Date",
    "MI COC Date",
    "Interest From Date",
)


def _text(value) -> str:
    return "" if is_blank(value) else str(value).strip()


def _lower(value) -> str:
    return _text(value).lower()


def _is_numeric(value) -> bool:
    if isinstance(value, bool) or is_blank(value):
        return False
    try:
        float(strip_numeric_decoration(str(value)))
        return True
    except (TypeError, ValueError):
        return False


def _as_float(value) -> float | None:
    if not _is_numeric(value):
        return None
    return float(strip_numeric_decoration(str(value)))


# Excel serials outside this window are certainly not real loan dates.
# 1 == 1899-12-31; 2958465 == 9999-12-31. Zero and negatives are the "empty
# cell" sentinel and must NOT become 1899-12-30.
MIN_EXCEL_SERIAL = 1
MAX_EXCEL_SERIAL = 2958465


def _excel_serial_to_date(value: float) -> date | None:
    """Match Excel/VBA serial-date behaviour closely enough for loan files.

    Returns None for 0, negatives, and out-of-range serials. A literal 0 in a
    date cell means "empty" in these exports; converting it to 1899-12-30
    produced a date that silently passed comparisons against real dates.
    """
    try:
        serial = float(value)
    except (TypeError, ValueError):
        return None
    if not MIN_EXCEL_SERIAL <= serial <= MAX_EXCEL_SERIAL:
        return None
    try:
        return (datetime(1899, 12, 30) + timedelta(days=serial)).date()
    except (TypeError, ValueError, OverflowError):
        return None


def _parse_vba_date(value, field_name: str = "") -> date | None:
    """Parse dates accepted by the VBA logic, including Excel serial values."""
    if is_blank(value):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    # Module 1 converts numeric values in every field whose name contains Date.
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return _excel_serial_to_date(value)

    raw = str(value).strip()
    if raw == "":
        return None

    # Try real date formats BEFORE treating the text as an Excel serial.
    # '20240115' is a valid %Y%m%d date; reading it as serial 20,240,115
    # overflows and previously returned None, so YYYYMMDD dates in any field
    # named "...Date" were reported Invalid while parsing fine elsewhere.
    formats = list(DATE_FORMATS) + [
        "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y %H:%M:%S",
        "%Y-%m-%d %H:%M:%S", "%m/%d/%Y %I:%M:%S %p",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue

    try:
        return datetime.fromisoformat(raw).date()
    except ValueError:
        pass

    # Only now fall back to a serial reading, and only for date-ish fields.
    if "date" in field_name.lower():
        try:
            return _excel_serial_to_date(float(raw))
        except ValueError:
            return None
    return None


def _invalid_vba_year(value: date) -> bool:
    year_text = f"{value.year:04d}"
    return year_text[:2] in {"00", "02"}


def _add_months(value: date, months: int) -> date | None:
    """Shift by whole months. Returns None instead of raising when the result
    falls outside date's supported year range, so one absurd Amortization Term
    cannot abort validation of an entire file."""
    month_index = value.year * 12 + (value.month - 1) + months
    year, month_zero = divmod(month_index, 12)
    month = month_zero + 1
    if not date.min.year <= year <= date.max.year:
        return None
    month_lengths = [31, 29 if _is_leap(year) else 28, 31, 30, 31, 30,
                     31, 31, 30, 31, 30, 31]
    return date(year, month, min(value.day, month_lengths[month - 1]))


def _is_leap(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def _first_day_after_months(value: date, months: int) -> date | None:
    shifted = _add_months(value.replace(day=1), months)
    return None if shifted is None else shifted.replace(day=1)


def _add_workdays(value: date, days: int) -> date:
    current = value
    added = 0
    while added < days:
        current += timedelta(days=1)
        if current.weekday() < 5:
            added += 1
    return current


def _subtract_years(value: date, years: int) -> date:
    try:
        return value.replace(year=value.year - years)
    except ValueError:  # February 29
        return value.replace(year=value.year - years, day=28)


def get_borrower_number(field_name) -> int:
    name = _text(field_name).upper()
    for borrower_no in range(1, 5):
        prefix = f"B{borrower_no}"
        if (f"BORROWER {borrower_no}" in name or f"{prefix} " in name
                or name.startswith(prefix)):
            return borrower_no
    return 0


def _field_value(fields: dict, field_name: str):
    item = fields.get(field_name)
    return None if item is None else item["value"]


def _field_row(fields: dict, field_name: str) -> int | None:
    item = fields.get(field_name)
    return None if item is None else item["row"]


def _borrower_applicable(borrower_no: int, fields: dict) -> bool:
    borrower_count = 0
    for key, item in fields.items():
        if key.strip().lower() == "number of borrowers":
            if _is_numeric(item["value"]):
                borrower_count = int(round(float(strip_numeric_decoration(str(item["value"])))))
            break
    return True if borrower_count == 0 else borrower_no <= borrower_count


def _set_result(results: list[str], row_index: int | None, message: str) -> None:
    if row_index is not None and 0 <= row_index < len(results):
        results[row_index] = message


def _validate_number_of_borrowers(value) -> str:
    number = _as_float(value)
    if number is None or number < 1 or number > 4:
        return "Invalid Number"
    return "Valid"


def _validate_birthdate(value, field_name: str, today: date) -> str:
    parsed = _parse_vba_date(value, field_name)
    if parsed is None or _invalid_vba_year(parsed):
        return "Invalid Date"
    if parsed > today or parsed > _subtract_years(today, 18):
        return "Invalid Date"
    return "Valid"


def _validate_years(value) -> str:
    number = _as_float(value)
    if number is None:
        return "Invalid Number"
    if number < 0 or number > 99.92:
        return "Invalid Range"
    decimal_value = round(number - int(number), 2)
    allowed = {0, 0.08, 0.17, 0.25, 0.33, 0.42,
               0.50, 0.58, 0.67, 0.75, 0.83, 0.92}
    return "Valid" if decimal_value in allowed else "Invalid Decimal"


def _validate_standard_date(value, field_name: str, today: date) -> str:
    parsed = _parse_vba_date(value, field_name)
    if parsed is None or _invalid_vba_year(parsed) or parsed > today:
        return "Invalid Date"
    return "Valid"


def evaluate_macro_business_rules(field_names, values, loan_ids=None,
                                  today: date | None = None) -> list[str]:
    """Translate VBA Module 1 and return one business-rule result per row.

    The original macro groups rows by Loan ID. Files without a Loan ID column
    are treated as one loan, which matches the uploaded sample workbook.
    Duplicate Data Field names follow VBA Scripting.Dictionary behaviour: the
    last occurrence in a loan replaces earlier occurrences for cross-field
    validation.
    """
    today = today or date.today()
    count = len(field_names)
    results = [""] * count
    if loan_ids is None:
        loan_ids = ["__WORKBOOK__"] * count

    grouped: dict[str, dict[str, dict]] = {}
    collapsed = 0
    for row_index, (loan_id, field_name, value) in enumerate(
            zip(loan_ids, field_names, values)):
        loan_key = _text(loan_id) or "__BLANK_LOAN__"
        name = _text(field_name)
        bucket = grouped.setdefault(loan_key, {})
        if name in bucket:
            # VBA Scripting.Dictionary semantics: last occurrence wins. Repeated
            # names (e.g. three "Amount of Other Lien" rows) therefore leave the
            # earlier rows without a macro result. Surface it rather than hide it.
            collapsed += 1
        bucket[name] = {"value": value, "row": row_index}

    if collapsed:
        log.warning("%d row(s) share a Data Field name with a later row and "
                    "were skipped by macro business rules (last occurrence "
                    "wins, matching the VBA macro).", collapsed)

    for fields in grouped.values():
        # Per-field validations in the same order as Module 1.
        for field_name, item in list(fields.items()):
            value = item["value"]
            row_index = item["row"]
            borrower_no = get_borrower_number(field_name)

            if field_name.strip().lower() == "number of borrowers":
                _set_result(results, row_index,
                            _validate_number_of_borrowers(value))

            if "birthdate" in field_name.lower():
                if borrower_no == 0 or _borrower_applicable(borrower_no, fields):
                    _set_result(results, row_index,
                                _validate_birthdate(value, field_name, today))
                else:
                    _set_result(results, row_index, "")

            if ("years in current home" in field_name.lower()
                    or "years in line of work" in field_name.lower()):
                if borrower_no == 0 or _borrower_applicable(borrower_no, fields):
                    _set_result(results, row_index, _validate_years(value))
                else:
                    _set_result(results, row_index, "")

            if (field_name.strip() in STANDARD_DATE_FIELDS
                    and "birthdate" not in field_name.lower()
                    and "photo id expiration date" not in field_name.lower()):
                _set_result(results, row_index,
                            _validate_standard_date(value, field_name, today))

        # Cross-field validations, preserving the VBA call order/overwrites.
        _validate_date_consistency(fields, results)
        _validate_cash_disbursement(fields, results)
        _validate_prepayment_penalty(fields, results)
        _validate_date_range(fields, results)
        _validate_photo_id_expiration(fields, results, today)
        _validate_application_date(fields, results)
        _validate_resident_since_date(fields, results)
        _validate_passport_expiration(fields, results, today)
        _validate_creditor_received_application(fields, results)
        _validate_cash_to_close(fields, results)
        _validate_non_us_document_expiration(fields, results)
        _validate_date_last_rate_was_set(fields, results)
        _validate_effective_date_pmi(fields, results)
        _validate_expiration_date_pmi_certification(fields, results)
        _validate_first_payment_date(fields, results)
        _validate_maturity_date(fields, results)
        _validate_first_interest_rate_change_date(fields, results)

    return results


def _validate_date_consistency(fields: dict, results: list[str]) -> None:
    note_date = _parse_vba_date(_field_value(fields, "Note Date"), "Note Date")
    if note_date is None:
        return
    for field_name in ("Borrower 1 Final Signature Date",
                       "Notary Acknowledgment Date",
                       "Closing - Settlement Date"):
        if field_name not in fields:
            continue
        parsed = _parse_vba_date(_field_value(fields, field_name), field_name)
        row = _field_row(fields, field_name)
        if parsed is None:
            _set_result(results, row, "Invalid Date")
        elif parsed != note_date:
            _set_result(
                results, row,
                f"Date mismatch with Note Date ({note_date:%m/%d/%Y})")


def _validate_cash_disbursement(fields: dict, results: list[str]) -> None:
    if "Cash Disbursement Date" not in fields or "Note Date" not in fields:
        return
    row = _field_row(fields, "Cash Disbursement Date")
    note_date = _parse_vba_date(_field_value(fields, "Note Date"), "Note Date")
    if note_date is None:
        _set_result(results, row, "Invalid Date")
        return
    if (_lower(_field_value(fields, "Loan Purpose")) == "refinance"
            and _lower(_field_value(fields, "Occupancy")) == "primary residence"):
        expected = _add_workdays(note_date, 3)
    else:
        expected = note_date
    actual = _parse_vba_date(
        _field_value(fields, "Cash Disbursement Date"), "Cash Disbursement Date")
    _set_result(results, row, "Valid" if actual == expected
                else "Invalid Cash Disbursement Date")


def _validate_prepayment_penalty(fields: dict, results: list[str]) -> None:
    field_name = "Prepayment Penalty Calculation"
    if field_name not in fields:
        return
    row = _field_row(fields, field_name)
    penalty = _lower(_field_value(fields, field_name))
    occupancy = _lower(_field_value(fields, "Occupancy"))
    other_rider = _lower(_field_value(fields, "Other Rider"))
    if occupancy == "investment" and other_rider == "true":
        if penalty in {"", "no prepayment penalty"}:
            message = ("Possible Prepayment Penalty as the Other rider box "
                       "is check marked")
        else:
            message = "Valid"
    else:
        message = ("Valid" if penalty == "no prepayment penalty" else
                   "Possible selected incorrect option for Prepayment Penalty calculation")
    _set_result(results, row, message)


def _validate_date_range(fields: dict, results: list[str]) -> None:
    application = _parse_vba_date(_field_value(fields, "Application Date"),
                                  "Application Date")
    cash = _parse_vba_date(_field_value(fields, "Cash Disbursement Date"),
                           "Cash Disbursement Date")
    if application is None or cash is None:
        return
    for field_name, item in fields.items():
        if not any(fragment.lower() in field_name.lower()
                   for fragment in DATE_RANGE_FIELD_FRAGMENTS):
            continue
        value = item["value"]
        if is_blank(value):
            continue
        parsed = _parse_vba_date(value, field_name)
        if parsed is None:
            message = "Invalid Date"
        elif _invalid_vba_year(parsed):
            message = "Invalid Date"
        elif not (application <= parsed <= cash):
            message = "Date should be between Application Date and Cash Disbursement Date"
        else:
            message = "Valid"
        _set_result(results, item["row"], message)


def _validate_photo_id_expiration(fields: dict, results: list[str], today: date) -> None:
    note_date = _parse_vba_date(_field_value(fields, "Note Date"), "Note Date")
    if note_date is None:
        return
    for field_name, item in fields.items():
        if "photo id expiration date" not in field_name.lower():
            continue
        borrower_no = get_borrower_number(field_name)
        if borrower_no and not _borrower_applicable(borrower_no, fields):
            _set_result(results, item["row"], "")
            continue
        parsed = _parse_vba_date(item["value"], field_name)
        if parsed is None:
            message = "Invalid Date"
        elif _invalid_vba_year(parsed):
            message = "Invalid Year"
        elif parsed <= today or parsed < note_date:
            message = "The Date is not future or less than Note date"
        else:
            message = "Valid"
        _set_result(results, item["row"], message)


def _validate_application_date(fields: dict, results: list[str]) -> None:
    field_name = "Application Date"
    if field_name not in fields:
        return
    row = _field_row(fields, field_name)
    application = _parse_vba_date(_field_value(fields, field_name), field_name)
    if application is None:
        _set_result(results, row, "Invalid Date")
        return
    if _invalid_vba_year(application):
        _set_result(results, row, "Invalid Year")
        return
    for compare_name, item in fields.items():
        lower_name = compare_name.lower()
        if ("date" not in lower_name or compare_name == field_name
                or "birthdate" in lower_name
                or "date of resident since" in lower_name
                or "valid date" in lower_name):
            continue
        compare_date = _parse_vba_date(item["value"], compare_name)
        if compare_date is not None and compare_date < application:
            _set_result(
                results, row,
                f"Date is not older than {compare_name} ({compare_date:%m/%d/%Y})")
            return
    _set_result(results, row, "Valid")


def _citizen_field_name(borrower_no: int) -> str:
    return f"Borrower {borrower_no} Citizen" if borrower_no else ""


def _validate_resident_since_date(fields: dict, results: list[str]) -> None:
    for field_name, item in fields.items():
        lower_name = field_name.lower()
        is_target = ("date resident since" in lower_name
                     or "date of resident since" in lower_name)
        if (not is_target or "b1 date resident since/valid date" in lower_name
                or "b2 date resident since/valid date" in lower_name):
            continue
        borrower_no = get_borrower_number(field_name)
        if borrower_no and not _borrower_applicable(borrower_no, fields):
            _set_result(results, item["row"], "")
            continue
        citizen = _lower(_field_value(fields, _citizen_field_name(borrower_no)))
        mandatory = citizen != "us citizen"
        if is_blank(item["value"]):
            _set_result(results, item["row"], "Invalid Date" if mandatory else "")
            continue
        parsed = _parse_vba_date(item["value"], field_name)
        if parsed is None:
            message = "Invalid Date"
        elif _invalid_vba_year(parsed):
            message = "Invalid Year"
        else:
            message = "Valid"
        _set_result(results, item["row"], message)


def _validate_passport_expiration(fields: dict, results: list[str], today: date) -> None:
    note_date = _parse_vba_date(_field_value(fields, "Note Date"), "Note Date")
    for field_name, item in fields.items():
        if "passport expiration date" not in field_name.lower():
            continue
        borrower_no = get_borrower_number(field_name)
        if borrower_no and not _borrower_applicable(borrower_no, fields):
            _set_result(results, item["row"], "")
            continue
        if is_blank(item["value"]):
            _set_result(results, item["row"], "")
            continue
        parsed = _parse_vba_date(item["value"], field_name)
        if parsed is None:
            message = "Invalid Date"
        elif _invalid_vba_year(parsed):
            message = "Invalid Year"
        elif parsed < today:
            message = "The Date is not future or less than Note date"
        elif note_date is not None and parsed < note_date:
            message = "Date is before Note date"
        else:
            message = "Valid"
        _set_result(results, item["row"], message)


def _validate_creditor_received_application(fields: dict, results: list[str]) -> None:
    field_name = "Date Creditor Received Application"
    if field_name not in fields:
        return
    row = _field_row(fields, field_name)
    parsed = _parse_vba_date(_field_value(fields, field_name), field_name)
    if parsed is None:
        _set_result(results, row, "Invalid Date")
        return
    if _invalid_vba_year(parsed):
        _set_result(results, row, "Invalid Year")
        return
    application = _parse_vba_date(_field_value(fields, "Application Date"),
                                  "Application Date")
    if application is None:
        return
    _set_result(results, row, "Valid" if parsed == application
                else "Not Matching with Application date")


def _validate_cash_to_close(fields: dict, results: list[str]) -> None:
    field_name = "Cash to Close"
    if field_name not in fields:
        return
    row = _field_row(fields, field_name)
    amount = _as_float(_field_value(fields, field_name))
    if amount is None:
        _set_result(results, row, "Invalid Number")
    elif amount < 0:
        _set_result(results, row, "Cash to close reflects as negative")
    else:
        _set_result(results, row, "Valid")


def _validate_non_us_document_expiration(fields: dict, results: list[str]) -> None:
    note_date = _parse_vba_date(_field_value(fields, "Note Date"), "Note Date")
    for field_name, item in fields.items():
        if "non-us document expiration date" not in field_name.lower():
            continue
        borrower_no = get_borrower_number(field_name)
        if borrower_no and not _borrower_applicable(borrower_no, fields):
            _set_result(results, item["row"], "")
            continue
        citizen = _lower(_field_value(fields, _citizen_field_name(borrower_no)))
        mandatory = citizen != "us citizen"
        if is_blank(item["value"]):
            _set_result(results, item["row"], "Invalid Date" if mandatory else "")
            continue
        parsed = _parse_vba_date(item["value"], field_name)
        if parsed is None:
            message = "Invalid Date"
        elif _invalid_vba_year(parsed):
            message = "Invalid Year"
        elif note_date is not None and parsed <= note_date:
            message = "Date is before Note date"
        else:
            message = "Valid"
        _set_result(results, item["row"], message)


def _validate_date_last_rate_was_set(fields: dict, results: list[str]) -> None:
    field_name = "Date Last Rate Was Set"
    if field_name not in fields:
        return
    row = _field_row(fields, field_name)
    parsed = _parse_vba_date(_field_value(fields, field_name), field_name)
    if parsed is None:
        _set_result(results, row, "Invalid Date")
        return
    if _invalid_vba_year(parsed):
        _set_result(results, row, "Invalid Year")
        return
    application = _parse_vba_date(_field_value(fields, "Application Date"),
                                  "Application Date")
    if application is not None and parsed < application:
        _set_result(results, row, "Date is before Application date")
        return
    note_date = _parse_vba_date(_field_value(fields, "Note Date"), "Note Date")
    if note_date is not None and parsed >= note_date:
        _set_result(results, row, "Date is not before Note date")
        return
    _set_result(results, row, "Valid")


def _validate_effective_date_pmi(fields: dict, results: list[str]) -> None:
    field_name = "Effective Date - PMI"
    if field_name not in fields:
        return
    row = _field_row(fields, field_name)
    loan_type = _lower(_field_value(fields, "Loan Type"))
    premium = _as_float(_field_value(fields, "MI Initial Monthly Premium Amount"))
    if premium is None:
        return
    if loan_type != "conventional" or premium <= 0:
        _set_result(results, row, "")
        return
    parsed = _parse_vba_date(_field_value(fields, field_name), field_name)
    if parsed is None:
        _set_result(results, row, "Invalid Date")
        return
    if _invalid_vba_year(parsed):
        _set_result(results, row, "Invalid Year")
        return
    application = _parse_vba_date(_field_value(fields, "Application Date"),
                                  "Application Date")
    if application is not None and parsed < application:
        _set_result(results, row,
                    "Date is before Application date. Validate Rate date or application date")
        return
    note_date = _parse_vba_date(_field_value(fields, "Note Date"), "Note Date")
    if note_date is not None and parsed >= note_date:
        _set_result(results, row, "Date is not before Note date")
        return
    _set_result(results, row, "Valid")


def _validate_expiration_date_pmi_certification(fields: dict,
                                                 results: list[str]) -> None:
    field_name = "Expiration Date - PMI Certification"
    if field_name not in fields:
        return
    row = _field_row(fields, field_name)
    loan_type = _lower(_field_value(fields, "Loan Type"))
    premium = _as_float(_field_value(fields, "MI Initial Monthly Premium Amount"))
    if premium is None:
        return
    if loan_type != "conventional" or premium <= 0:
        _set_result(results, row, "")
        return
    parsed = _parse_vba_date(_field_value(fields, field_name), field_name)
    if parsed is None:
        _set_result(results, row, "Invalid Date")
        return
    if _invalid_vba_year(parsed):
        _set_result(results, row, "Invalid Year")
        return
    first_payment = _parse_vba_date(_field_value(fields, "First Payment Date"),
                                    "First Payment Date")
    if first_payment is not None and parsed <= first_payment:
        _set_result(results, row,
                    "Expiration Date should be after First Payment Date")
        return
    _set_result(results, row, "Valid")


def _validate_first_payment_date(fields: dict, results: list[str]) -> None:
    field_name = "First Payment Date"
    if field_name not in fields:
        return
    row = _field_row(fields, field_name)
    first_payment = _parse_vba_date(_field_value(fields, field_name), field_name)
    if first_payment is None:
        _set_result(results, row, "Invalid Date")
        return
    if _invalid_vba_year(first_payment):
        _set_result(results, row, "Invalid Year")
        return
    note_date = _parse_vba_date(_field_value(fields, "Note Date"), "Note Date")
    if note_date is None:
        if "Note Date" in fields:
            _set_result(results, row, "Invalid Date")
        return
    expected = {d for d in (_first_day_after_months(note_date, 1),
                            _first_day_after_months(note_date, 2))
                if d is not None}
    _set_result(results, row, "Valid" if first_payment in expected
                else "Invalid First Payment Date")


def _validate_maturity_date(fields: dict, results: list[str]) -> None:
    field_name = "Maturity Date"
    if field_name not in fields:
        return
    row = _field_row(fields, field_name)
    maturity = _parse_vba_date(_field_value(fields, field_name), field_name)
    if maturity is None:
        _set_result(results, row, "Invalid Date")
        return
    if _invalid_vba_year(maturity):
        _set_result(results, row, "Invalid Year")
        return
    if "Amortization Term" not in fields:
        return
    term_value = _as_float(_field_value(fields, "Amortization Term"))
    if term_value is None:
        _set_result(results, row, "Invalid Amortization Term")
        return
    amortization_term = int(round(term_value))
    first_payment = _parse_vba_date(_field_value(fields, "First Payment Date"),
                                    "First Payment Date")
    if first_payment is None:
        if "First Payment Date" in fields:
            _set_result(results, row, "Invalid Date")
        return
    expected = _first_day_after_months(first_payment, amortization_term - 1)
    if expected is None:
        _set_result(results, row,
                    f"Invalid Amortization Term ({amortization_term}); "
                    f"implied maturity date is out of range")
        return
    _set_result(results, row, "Valid" if maturity == expected
                else "Invalid Maturity Date")


def _validate_first_interest_rate_change_date(fields: dict,
                                               results: list[str]) -> None:
    field_name = "First Interest Rate Change Date"
    if field_name not in fields:
        return
    row = _field_row(fields, field_name)
    if is_blank(_field_value(fields, field_name)):
        _set_result(results, row, "Valid")
        return
    parsed = _parse_vba_date(_field_value(fields, field_name), field_name)
    if parsed is None:
        _set_result(results, row, "Invalid Date")
        return
    if _invalid_vba_year(parsed):
        _set_result(results, row, "Invalid Year")
        return
    first_payment = _parse_vba_date(_field_value(fields, "First Payment Date"),
                                    "First Payment Date")
    if first_payment is None:
        if "First Payment Date" in fields:
            _set_result(results, row, "Invalid Date")
        return
    if parsed <= first_payment:
        _set_result(results, row,
                    "First Interest Rate Change Date must be after First Payment Date")
        return
    if parsed.day != 1:
        _set_result(results, row, "Invalid First Interest Rate Change Date")
        return
    _set_result(results, row, "Valid")


def combine_validation_result(dictionary_result, macro_result: str) -> str:
    """Produce the requested single Result column from all validation layers."""
    match_status, type_status, type_remark, numeric_flag, enum_status, enum_remark = dictionary_result
    failures = []
    if match_status == "Unmatched":
        failures.append("Field not found in data dictionary")
    if type_status == "FALSE":
        failures.append(type_remark or "Invalid data type")
    if numeric_flag.startswith("FLAGGED") and type_status != "FALSE":
        failures.append(numeric_flag)
    if enum_status == "FALSE":
        failures.append(enum_remark or "Invalid enumeration")
    if macro_result and macro_result != "Valid":
        failures.append(macro_result)

    # Remove duplicate messages while preserving their order.
    failures = list(dict.fromkeys(failures))
    if failures:
        return "Invalid - " + "; ".join(failures)

    # Final classification is intentionally exhaustive so that every row is
    # exactly one of Final Valid, Final Invalid, or Final Blank in the summary.
    # Blank fields remain Final Blank unless another validation layer has
    # already produced a failure above.
    if type_status.startswith("N/A - blank"):
        return "N/A - blank value"

    # Any non-blank row with no validation failures is considered final-valid,
    # even when no specific type/enum/macro rule was applicable.
    if match_status == "Matched":
        return "Valid"
    return "Invalid"


# --------------------------------------------------------------------------- #
# Dictionary loading
# --------------------------------------------------------------------------- #

def load_dictionary(path: Path) -> pd.DataFrame:
    """Load the data dictionary, indexed by the trimmed field label."""
    # keep_default_na=False: "NA", "N/A", "None" and "NULL" are legitimate
    # enum values in this domain, and pandas would otherwise turn them into
    # NaN and silently drop them from the allowed-value lists.
    reader = pd.read_csv if path.suffix.lower() == ".csv" else pd.read_excel
    frame = reader(path, keep_default_na=False, na_values=[""])

    missing = [c for c in (DICT_LABEL_COL, DICT_TYPE_COL)
               if c not in frame.columns]
    if missing:
        raise ValueError(
            f"Dictionary {path.name} is missing column(s): {missing}. "
            f"Found: {list(frame.columns)}"
        )
    if DICT_ENUM_COL not in frame.columns:
        log.warning("Dictionary has no %r column; enum checks will be skipped.",
                    DICT_ENUM_COL)
        frame[DICT_ENUM_COL] = None

    frame = frame.dropna(subset=[DICT_LABEL_COL]).copy()
    frame["_key"] = frame[DICT_LABEL_COL].astype(str).str.strip()

    duplicates = frame["_key"].duplicated().sum()
    if duplicates:
        log.warning("Dictionary has %d duplicate label(s); keeping first.",
                    duplicates)
        frame = frame.drop_duplicates("_key")

    log.info("Dictionary loaded: %d field definitions.", len(frame))
    return frame.set_index("_key")


# --------------------------------------------------------------------------- #
# Per-file validation
# --------------------------------------------------------------------------- #

def find_header_row(worksheet, max_scan=20) -> int:
    """Locate the 1-based row holding SAMPLE_LABEL_COL."""
    for row_idx in range(1, min(max_scan, worksheet.max_row) + 1):
        values = {str(c.value).strip() for c in worksheet[row_idx]
                  if c.value is not None}
        if SAMPLE_LABEL_COL in values:
            return row_idx
    raise ValueError(
        f"Could not find a header row containing {SAMPLE_LABEL_COL!r} "
        f"in the first {max_scan} rows."
    )


def consolidate_result(row):
    """Collapse every check on one field into a single verdict and remark.

    Order of precedence: a failure anywhere wins; otherwise an incomplete
    check is surfaced as "Review Required" rather than reported as passing;
    only then is the field called Valid. A field nothing applied to is
    "Not Validated", never Valid -- claiming a pass we did not perform is the
    one outcome that would mislead a reviewer.
    """
    (match_status, type_status, type_remark, numeric_flag,
     enum_status, enum_remark, macro_result, result,
     condition_status, condition_kind, condition_remark) = row[:11]
    # row[11] = Condition Text, row[12] = Condition Outcome (display only)

    failures, incomplete, checked = [], [], False

    if match_status == "Unmatched":
        failures.append("[Dictionary] Field not found in the data dictionary.")
    elif match_status == "Matched":
        checked = True

    if type_status == "FALSE":
        failures.append(f"[Data Type] {type_remark}".strip())
    elif type_status == "TRUE":
        checked = True

    if str(numeric_flag).startswith("FLAGGED"):
        failures.append(f"[Numeric Format] {numeric_flag}")

    if enum_status == "FALSE":
        failures.append(f"[Enum] {enum_remark}".strip())
    elif str(enum_status).startswith("TRUE"):
        checked = True
        if str(enum_status).startswith("TRUE - ") and enum_remark:
            incomplete.append(f"[Enum] {enum_remark}")

    if macro_result and macro_result not in ("Valid", "N/A - blank value"):
        failures.append(f"[Business Rule] {macro_result}")
    elif macro_result == "Valid":
        checked = True

    condition_text = str(condition_status or "")
    if condition_text == "Invalid":
        parts = [p for p in str(condition_remark or "").split(" | ")
                 if p.startswith("[Invalid]")]
        # Several clauses can emit the same sentence; keep one copy.
        parts = list(dict.fromkeys(p.replace("[Invalid] ", "").strip()
                                   for p in parts))
        detail = " ".join(parts) if parts else str(condition_remark or "")
        failures.append(f"[Condition] {detail}".strip())
    elif condition_text == "Not Automated":
        incomplete.append("[Condition] Rule could not be interpreted "
                          "automatically; manual review required.")
    elif condition_text.startswith("Valid"):
        checked = True
        if condition_text == "Valid - partial":
            incomplete.append("[Condition] Some rules for this field could "
                              "not be interpreted automatically.")

    # Two clauses on the same field can produce an identical message; show it
    # once rather than repeating it in the UI.
    def dedupe(items):
        return list(dict.fromkeys(x.strip() for x in items if x and x.strip()))

    if failures:
        return "Invalid", " | ".join(dedupe(failures))
    if incomplete:
        return "Review Required", " | ".join(dedupe(incomplete))
    if checked:
        return "Valid", ""
    return "Not Validated", "No validation applied to this field."


def evaluate_rows(field_names, labels, values, dictionary, loan_ids=None,
                  strict=False, blank_as_fail=False, strict_numeric=False,
                  as_of=None, condition_rules=None):
    """Return one 8-tuple matching NEW_COLUMNS for each sample row."""
    dictionary_results = []
    for label, value in zip(labels, values):
        key = "" if label is None else str(label).strip()

        if not key or key not in dictionary.index:
            reason = "N/A - not in dictionary"
            note = (f"Field label {key!r} has no matching entry in the data "
                    f"dictionary.") if key else "Row has no Data Label."
            dictionary_results.append(
                ("Unmatched", reason, note, "", reason, ""))
            continue

        data_type = dictionary.at[key, DICT_TYPE_COL]
        raw_enums = dictionary.at[key, DICT_ENUM_COL]

        if is_blank(value):
            if blank_as_fail:
                note = f"Value is blank; field is typed {data_type}."
                dictionary_results.append(
                    ("Matched", "FALSE", note, "", "FALSE", note))
            else:
                reason = "N/A - blank value"
                dictionary_results.append(
                    ("Matched", reason, "", "", reason, ""))
            continue

        type_status, type_remark = validate_data_type(value, data_type)
        enum_status, enum_remark = validate_enum(
            value, data_type, raw_enums, strict=strict)

        if str(data_type).strip() in ("Number", "Integer"):
            numeric_flag, numeric_detail = inspect_numeric_format(
                value, strict=strict_numeric)
            if numeric_flag.startswith("FLAGGED") and type_status != "FALSE":
                type_status, type_remark = "FALSE", numeric_detail
        else:
            numeric_flag = ""

        dictionary_results.append(
            ("Matched", type_status, type_remark, numeric_flag,
             enum_status, enum_remark))

    macro_results = evaluate_macro_business_rules(
        field_names, values, loan_ids=loan_ids, today=as_of)

    base = [
        dictionary_result + (
            macro_result,
            combine_validation_result(dictionary_result, macro_result),
        )
        for dictionary_result, macro_result
        in zip(dictionary_results, macro_results)
    ]

    # Condition validation is strictly additive: it reads the same inputs but
    # contributes only its own three columns and never alters "Result".
    if condition_rules and conditions is not None:
        condition_results = conditions.evaluate_conditions(
            field_names, values, condition_rules)
    else:
        blank = ("N/A - no condition rule", "", "",
                 "(condition spec not supplied)", "")
        condition_results = [blank] * len(base)

    combined = [row + tuple(extra)
                for row, extra in zip(base, condition_results)]
    return [row + consolidate_result(row) for row in combined]


def fill_for(status: str) -> PatternFill:
    if status in ("Matched", "TRUE", "Valid") or status.startswith("OK"):
        return FILL_PASS
    if (status in ("Unmatched", "FALSE") or status.startswith("FLAGGED")
            or status.startswith("Invalid")):
        return FILL_FAIL
    if status.startswith("TRUE - "):
        return FILL_WARN
    return FILL_NA


def write_annotated_workbook(src: Path, dest: Path, dictionary,
                             strict=False, blank_as_fail=False,
                             strict_numeric=False, as_of=None,
                             display_name=None, condition_rules=None) -> dict:
    """Copy an .xlsx/.xlsm sample, append validation columns, and save.

    Preserves the original cells and their formatting.
    """
    workbook = openpyxl.load_workbook(src, keep_vba=src.suffix.lower() == ".xlsm")
    worksheet = workbook.active

    header_row = find_header_row(worksheet)
    headers = {}
    for cell in worksheet[header_row]:
        if cell.value is not None:
            headers.setdefault(str(cell.value).strip(), cell.column)

    for required in (SAMPLE_NAME_COL, SAMPLE_LABEL_COL, SAMPLE_VALUE_COL):
        if required not in headers:
            raise ValueError(f"{src.name}: missing column {required!r}.")

    name_col = headers[SAMPLE_NAME_COL]
    label_col = headers[SAMPLE_LABEL_COL]
    value_col = headers[SAMPLE_VALUE_COL]
    loan_id_col = headers.get(SAMPLE_LOAN_ID_COL)
    first_data_row = header_row + 1

    field_names = [worksheet.cell(row=r, column=name_col).value
                   for r in range(first_data_row, worksheet.max_row + 1)]
    labels = [worksheet.cell(row=r, column=label_col).value
              for r in range(first_data_row, worksheet.max_row + 1)]
    values = [worksheet.cell(row=r, column=value_col).value
              for r in range(first_data_row, worksheet.max_row + 1)]
    loan_ids = ([worksheet.cell(row=r, column=loan_id_col).value
                 for r in range(first_data_row, worksheet.max_row + 1)]
                if loan_id_col else None)

    results = evaluate_rows(field_names, labels, values, dictionary,
                            loan_ids=loan_ids, strict=strict,
                            blank_as_fail=blank_as_fail,
                            strict_numeric=strict_numeric, as_of=as_of,
                            condition_rules=condition_rules)

    # Reuse an existing header's styling so appended columns look native.
    template = worksheet.cell(row=header_row, column=label_col)
    start_col = worksheet.max_column + 1

    for offset, name in enumerate(NEW_COLUMNS):
        cell = worksheet.cell(row=header_row, column=start_col + offset,
                              value=name)
        cell.font = copy(template.font)
        cell.fill = copy(template.fill)
        cell.alignment = copy(template.alignment)
        cell.border = copy(template.border)
        letter = get_column_letter(start_col + offset)
        if name == "Condition Text":
            width = 80
        elif name == "Condition Outcome":
            width = 70
        elif name == "Final Remarks":
            width = 90
        elif name == "Final Result":
            width = 18
        elif name == "Condition Remarks":
            width = 70
        elif name == "Condition Validation":
            width = 26
        elif name == "Condition Rule Type":
            width = 18
        elif name == "Result":
            width = 70
        elif name == "Macro Validation Result":
            width = 48
        elif "Remarks" in name:
            width = 60
        elif name == "Numeric Format Flag":
            width = 34
        else:
            width = 26
        worksheet.column_dimensions[letter].width = width

    for row_offset, row_result in enumerate(results):
        excel_row = first_data_row + row_offset
        for col_offset, entry in enumerate(row_result):
            cell = worksheet.cell(row=excel_row,
                                  column=start_col + col_offset,
                                  value=entry or None)
            column_name = NEW_COLUMNS[col_offset]
            is_status = column_name not in ("Data Type Remarks", "Enum Remarks",
                                            "Condition Remarks",
                                            "Condition Text",
                                            "Condition Outcome",
                                            "Final Remarks")
            is_failure = (entry in ("FALSE", "Unmatched")
                          or str(entry).startswith("Invalid"))
            cell.font = Font(name="Arial", size=10,
                             bold=is_status and is_failure)
            if is_status and entry:
                if column_name == "Macro Validation Result":
                    cell.fill = FILL_PASS if entry == "Valid" else FILL_FAIL
                elif column_name == "Final Result":
                    text = str(entry)
                    if text == "Invalid":
                        cell.fill = FILL_FAIL
                    elif text == "Valid":
                        cell.fill = FILL_PASS
                    elif text == "Review Required":
                        cell.fill = FILL_WARN
                    else:
                        cell.fill = FILL_NA
                elif column_name == "Condition Validation":
                    text = str(entry)
                    if text == "Invalid":
                        cell.fill = FILL_FAIL
                    elif text.startswith("Valid"):
                        cell.fill = FILL_PASS
                    elif text == "Not Automated":
                        cell.fill = FILL_WARN
                    else:
                        cell.fill = FILL_NA
                else:
                    cell.fill = fill_for(str(entry))
            if (not is_status or column_name in
                    ("Macro Validation Result", "Result",
                     "Condition Validation", "Final Result")):
                cell.alignment = openpyxl.styles.Alignment(
                    wrap_text=True, vertical="top")

    worksheet.freeze_panes = worksheet.cell(row=first_data_row, column=1)
    dest.parent.mkdir(parents=True, exist_ok=True)
    workbook.save(dest)
    return summarize(display_name or src.name, results, labels, dictionary)


def write_annotated_csv(src: Path, dest: Path, dictionary,
                        strict=False, blank_as_fail=False,
                        strict_numeric=False, as_of=None,
                        condition_rules=None) -> dict:
    """CSV path: no formatting to preserve, so round-trip through pandas."""
    # See load_dictionary: never let pandas coerce "NA"/"N/A" into NaN.
    # No dtype=str: forcing every cell to text made the CSV path disagree with
    # the xlsx path on 314 rows of Numeric Format Flag, because native numbers
    # were re-read as "numeric text". Blank cells still become NaN via
    # na_values and are handled by is_blank().
    frame = pd.read_csv(src, keep_default_na=False, na_values=[""])
    for required in (SAMPLE_NAME_COL, SAMPLE_LABEL_COL, SAMPLE_VALUE_COL):
        if required not in frame.columns:
            raise ValueError(f"{src.name}: missing column {required!r}.")

    loan_ids = (frame[SAMPLE_LOAN_ID_COL]
                if SAMPLE_LOAN_ID_COL in frame.columns else None)
    results = evaluate_rows(frame[SAMPLE_NAME_COL], frame[SAMPLE_LABEL_COL],
                            frame[SAMPLE_VALUE_COL], dictionary,
                            loan_ids=loan_ids, strict=strict,
                            blank_as_fail=blank_as_fail,
                            strict_numeric=strict_numeric, as_of=as_of,
                            condition_rules=condition_rules)
    for index, name in enumerate(NEW_COLUMNS):
        frame[name] = [r[index] for r in results]

    dest.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(dest, index=False)
    return summarize(src.name, results, frame[SAMPLE_LABEL_COL], dictionary)


def summarize(filename: str, results, labels=None, dictionary=None) -> dict:
    """Per-file counts for the run summary.

    Final Valid + Final Invalid + Final Blank is guaranteed to equal
    Total Fields because combine_validation_result() exhaustively classifies
    every row into one of those three outcomes.
    """
    total = len(results)

    total_enum = 0
    if labels is not None and dictionary is not None:
        for label in labels:
            key = "" if label is None else str(label).strip()
            if key and key in dictionary.index:
                data_type = dictionary.at[key, DICT_TYPE_COL]
                if str(data_type).strip() == "Enumeration":
                    total_enum += 1

    total_macro = sum(1 for r in results if r[6] not in ("", None))
    # Filter statistics directly from Final Result (column index 11), with fallback to r[7] if not consolidated
    final_valid = sum(1 for r in results if (str(r[13]) == "Valid" if len(r) > 11 else str(r[7]) == "Valid"))
    final_invalid = sum(1 for r in results if (str(r[13]) == "Invalid" if len(r) > 11 else str(r[7]).startswith("Invalid")))
    review_required = sum(1 for r in results if len(r) > 11 and str(r[13]) == "Review Required")
    # Informational count of blank field rows
    final_blank = sum(1 for r in results if r[1] == "N/A - blank value")

    # Any unclassified rows that do not fall into Valid, Invalid, or Review Required
                                                                              
                                                          
    final_other = total - (final_valid + final_invalid + review_required)
    if final_other > 0:
        log.warning("%s: %d row(s) produced an unrecognised Final Result status; "
                    "reported as 'Final Unclassified'.", filename, final_other)

    return {
        "File": filename,
        "Total Fields": total,
        "Matched": sum(1 for r in results if r[0] == "Matched"),
        "Unmatched": sum(1 for r in results if r[0] == "Unmatched"),
        "Type Pass": sum(1 for r in results if r[1] == "TRUE"),
        "Type Fail": sum(1 for r in results if r[1] == "FALSE"),
        "Blank Values": sum(1 for r in results if r[1] == "N/A - blank value"),
        "Total Enum": total_enum,
        "Enum Pass": sum(1 for r in results if r[4] == "TRUE"),
        "Enum Format Variance": sum(1 for r in results
                                    if str(r[4]).startswith("TRUE - ")),
        "Enum Fail": sum(1 for r in results if r[4] == "FALSE"),
        "Enum No List": sum(
            1 for r in results
            if r[4] == "N/A - no enum list defined"
        ),
        "Numeric Format Flagged": sum(1 for r in results
                                      if str(r[3]).startswith("FLAGGED")),
        "Total Macro": total_macro,
        "Macro Valid": sum(1 for r in results if r[6] == "Valid"),
        "Macro Invalid": sum(1 for r in results if r[6] not in ("", None, "Valid")),
        "Final Valid": final_valid,
        "Final Invalid": final_invalid,
        "Final Blank": final_blank,
        "Final Unclassified": final_other if final_other > 0 else 0,
        **_condition_counts(filename, results, total),
        **_final_counts(filename, results, total),
    }


# "Final Valid"/"Final Invalid" are already used by the Result-based counts,
# so the consolidated verdict is reported under "Overall ..." to avoid
# silently overwriting them in the summary.
FINAL_BUCKETS = ["Valid", "Invalid", "Review Required", "Not Validated"]


def _final_counts(filename, results, total) -> dict:
    """Mutually exclusive counts for the consolidated verdict."""
    verdicts = [str(r[13]) if len(r) > 13 else "" for r in results]
    counts = {f"Overall {b}": sum(1 for v in verdicts if v == b)
              for b in FINAL_BUCKETS}
    known = sum(counts.values())
    counts["Overall Unrecognised"] = total - known
    if counts["Overall Unrecognised"]:
        log.warning("%s: %d row(s) produced an unrecognised Final Result.",
                    filename, counts["Overall Unrecognised"])
    counts["Overall Total (reconciles)"] = known + counts["Overall Unrecognised"]
    return counts


# Every row lands in exactly one condition bucket, and the buckets sum to
# Total Fields so the report reconciles.
CONDITION_BUCKETS = [
    ("Cond Valid", "Valid"),
    ("Cond Valid - Partial", "Valid - partial"),
    ("Cond Invalid", "Invalid"),
    ("Cond Not Automated", "Not Automated"),
    ("Cond N/A - No Rule", "N/A - no condition rule"),
    ("Cond N/A - Condition Not Met", "N/A - condition not met"),
    ("Cond N/A - Blank Value", "N/A - blank value"),
    ("Cond N/A - Informational", "N/A - informational"),
]


def _condition_counts(filename, results, total) -> dict:
    """Mutually exclusive, collectively exhaustive counts for the condition
    columns. Anything unrecognised is reported separately rather than folded
    into a passing bucket."""
    statuses = [str(r[8]) if len(r) > 8 else "" for r in results]

    counts = {}
    for label, status in CONDITION_BUCKETS:
        counts[label] = sum(1 for value in statuses if value == status)

    known = sum(counts.values())
    counts["Cond Unclassified"] = total - known
    if counts["Cond Unclassified"]:
        log.warning("%s: %d row(s) have an unrecognised Condition Validation "
                    "status; counted as 'Cond Unclassified'.",
                    filename, counts["Cond Unclassified"])

    # Derived roll-ups. These deliberately overlap the buckets above and are
    # NOT part of the reconciliation total.
    counts["Cond Rules Applied"] = (
        counts["Cond Valid"] + counts["Cond Valid - Partial"]
        + counts["Cond Invalid"] + counts["Cond Not Automated"])
    counts["Cond Total (reconciles)"] = known + counts["Cond Unclassified"]
    return counts


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #

def collect_sample_files(input_path: Path) -> list[Path]:
    if input_path.is_file():
        return [input_path]
    files = sorted(
        p for p in input_path.iterdir()
        if p.is_file()
        and p.suffix.lower() in SAMPLE_EXTENSIONS
        and not p.name.startswith("~$")          # Excel lock files
    )
    return files


def print_versions() -> int:
    """Report the version of every module, so a mismatched pair is visible
    without running a validation."""
    found = getattr(conditions, "__version__", None)
    # Report the actual file being executed; a hardcoded name goes stale the
    # moment the file is renamed or copied.
    print(f"{Path(__file__).name:<26} {__version__}")
    print(f"condition_validation.py             {found or 'NOT INSTALLED'}")
    print(f"  parser version required           {REQUIRED_CONDITION_VERSION}")
    ok = found == REQUIRED_CONDITION_VERSION
    print(f"  status                            {'OK' if ok else 'MISMATCH'}")
    return 0 if ok else 1


def main(argv=None) -> int:
    # Checked before argparse, which would otherwise demand --input-dir and
    # the other required arguments just to print a version.
    if "--version" in (argv if argv is not None else sys.argv[1:]):
        return print_versions()

    parser = argparse.ArgumentParser(
        description="Validate loan sample files against a data dictionary.")
    parser.add_argument("--input-dir", required=True, type=Path,
                        help="Folder of sample files, or a single file.")
    parser.add_argument("--dict", required=True, type=Path,
                        dest="dictionary", help="Data dictionary workbook.")
    parser.add_argument("--output-dir", required=True, type=Path,
                        help="Folder for annotated output files.")
    parser.add_argument("--suffix", default="_validated",
                        help="Appended to each output filename.")
    parser.add_argument("--strict-enums", action="store_true",
                        help="Flag case/spacing-only enum differences as FALSE.")
    parser.add_argument("--strict-numeric", action="store_true",
                        help="Also flag amounts stored as text with legal "
                             "decoration ($, thousands separators, %%).")
    parser.add_argument("--blank-as-fail", action="store_true",
                        help="Treat blank values as FALSE instead of N/A.")
    parser.add_argument("--conditions", type=Path, default=None,
                        metavar="SPEC.xlsx",
                        help="Condition_Validation spec workbook. When given, "
                             "three extra columns are appended; existing "
                             "columns are unaffected.")
    parser.add_argument("--version", action="store_true",
                        help="Print the version of every module and exit.")
    parser.add_argument("--ignore-version", action="store_true",
                        help="Run even if condition_validation.py does not "
                             "match the expected version.")
    parser.add_argument("--as-of", default=None, metavar="YYYY-MM-DD",
                        help="Evaluation date for age/expiry business rules. "
                             "Defaults to today; pin it for reproducible runs.")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)-7s %(message)s")

    as_of = None
    if args.as_of:
        try:
            as_of = datetime.strptime(args.as_of, "%Y-%m-%d").date()
        except ValueError:
            log.error("--as-of must be YYYY-MM-DD, got %r", args.as_of)
            return 1
        log.info("Evaluating date rules as of %s", as_of)

    if not args.input_dir.exists():
        log.error("Input path not found: %s", args.input_dir)
        return 1
    if not args.dictionary.exists():
        log.error("Dictionary not found: %s", args.dictionary)
        return 1

    try:
        dictionary = load_dictionary(args.dictionary)
    except Exception as exc:
        log.error("Could not load dictionary: %s", exc)
        return 1

    condition_rules = None
    if args.conditions:
        if not check_condition_module_version() and not args.ignore_version:
            log.error("Refusing to run with a mismatched condition parser. "
                      "Pass --ignore-version to override.")
            return 1
        if conditions is None:
            log.error("condition_validation.py is not importable; "
                      "cannot use --conditions.")
            return 1
        if not args.conditions.exists():
            log.error("Condition spec not found: %s", args.conditions)
            return 1
        try:
            log.info("Versions: validator %s | condition parser %s "
                     "(requires %s)", __version__,
                     getattr(conditions, "__version__", "unknown"),
                     REQUIRED_CONDITION_VERSION)
            condition_rules = conditions.load_rules(args.conditions)
        except Exception as exc:
            log.error("Could not load condition spec: %s", exc)
            return 1

    if condition_rules is None:
        log.warning("=" * 70)
        log.warning("RUNNING WITHOUT CONDITION VALIDATION.")
        log.warning("--conditions was not supplied, so every row will report")
        log.warning("'N/A - no condition rule' and no business rule will be")
        log.warning("checked. Pass --conditions <spec.xlsx> for a full run.")
        log.warning("=" * 70)

    files = collect_sample_files(args.input_dir)
    if not files:
        log.error("No sample files (%s) found in %s",
                  ", ".join(sorted(SAMPLE_EXTENSIONS)), args.input_dir)
        return 1

    log.info("Found %d sample file(s).", len(files))
    args.output_dir.mkdir(parents=True, exist_ok=True)

    summaries, failed = [], 0
    for path in files:
        destination = args.output_dir / f"{path.stem}{args.suffix}{path.suffix}"
        try:
            if path.suffix.lower() == ".csv":
                stats = write_annotated_csv(path, destination, dictionary,
                                            args.strict_enums,
                                            args.blank_as_fail,
                                            args.strict_numeric, as_of=as_of,
                                            condition_rules=condition_rules)
            elif path.suffix.lower() == ".xls":
                # openpyxl cannot write legacy .xls; emit .xlsx instead.
                destination = destination.with_suffix(".xlsx")
                frame = pd.read_excel(path, keep_default_na=False,
                                      na_values=[""])
                temporary = args.output_dir / f".{path.stem}_tmp.xlsx"
                frame.to_excel(temporary, index=False)
                try:
                    stats = write_annotated_workbook(
                        temporary, destination, dictionary, args.strict_enums,
                        args.blank_as_fail, args.strict_numeric, as_of=as_of,
                        display_name=path.name,
                        condition_rules=condition_rules)
                finally:
                    # Remove the bridge file even if validation raises.
                    temporary.unlink(missing_ok=True)
            else:
                stats = write_annotated_workbook(path, destination, dictionary,
                                                 args.strict_enums,
                                                 args.blank_as_fail,
                                                 args.strict_numeric,
                                                 as_of=as_of,
                                                 condition_rules=condition_rules)
        except Exception as exc:
            failed += 1
            log.error("%s -> FAILED: %s", path.name, exc)
            continue

        if condition_rules and stats.get("Cond N/A - No Rule") == \
                stats["Total Fields"]:
            # A spec was loaded but matched nothing in this file: almost
            # always a Data Field naming mismatch between spec and extract.
            log.error("    %s: a condition spec was supplied but NOT ONE of "
                      "the %d fields matched a rule. Check that the spec's "
                      "'Data Field' names match this file.",
                      path.name, stats["Total Fields"])

        summaries.append(stats)
        log.info(
            "%s -> %s | %d fields | unmatched %d | type fail %d | "
            "numeric flagged %d | enum fail %d | variance %d",
            path.name, destination.name, stats["Total Fields"],
            stats["Unmatched"], stats["Type Fail"],
            stats["Numeric Format Flagged"], stats["Enum Fail"],
            stats["Enum Format Variance"])
        if condition_rules:
            log.info(
                "    conditions: %d valid | %d partial | %d invalid | "
                "%d not automated | %d no rule | %d not triggered | "
                "%d blank | %d informational | %d unclassified  = %d of %d",
                stats["Cond Valid"], stats["Cond Valid - Partial"],
                stats["Cond Invalid"], stats["Cond Not Automated"],
                stats["Cond N/A - No Rule"],
                stats["Cond N/A - Condition Not Met"],
                stats["Cond N/A - Blank Value"],
                stats["Cond N/A - Informational"],
                stats["Cond Unclassified"],
                stats["Cond Total (reconciles)"], stats["Total Fields"])
            if stats["Cond Total (reconciles)"] != stats["Total Fields"]:
                log.error("    condition counts do NOT reconcile for %s",
                          path.name)

        log.info("    FINAL: %d valid | %d invalid | %d review required | "
                 "%d not validated  = %d of %d",
                 stats["Overall Valid"], stats["Overall Invalid"],
                 stats["Overall Review Required"],
                 stats["Overall Not Validated"],
                 stats["Overall Total (reconciles)"], stats["Total Fields"])

    if summaries:
        summary_path = args.output_dir / "validation_summary.xlsx"
        summary = pd.DataFrame(summaries)
        totals = summary.drop(columns=["File"]).sum()
        totals["File"] = "TOTAL"
        summary = pd.concat([summary, totals.to_frame().T], ignore_index=True)
        summary.to_excel(summary_path, index=False)
        log.info("Summary written: %s", summary_path)

    log.info("Done. %d succeeded, %d failed.", len(summaries), failed)
    return 1 if failed and not summaries else 0


if __name__ == "__main__":
    sys.exit(main())
