import io
import json
import random
import time
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from app.auth import get_current_user_id
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from sqlalchemy import text
import pandas as pd
import openpyxl

from pathlib import Path
from app.database.connection import engine
from lm_helper.validate_loan_files_combined_v3 import evaluate_rows, summarize, find_header_row, is_blank
from lm_helper import condition_validation as cv

router = APIRouter(
    prefix="/api/loans",
    tags=["Loans"]
)

def _is_deadlock(exc: Exception) -> bool:
    s = str(exc)
    return "1205" in s or "deadlock" in s.lower()

def _retry_on_deadlock(fn, max_retries: int = 3):
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as exc:
            if attempt < max_retries - 1 and _is_deadlock(exc):
                time.sleep(0.05 * (2 ** attempt) + random.random() * 0.05)
                continue
            raise

# Load condition rules once at startup if spec exists
CONDITION_SPEC_PATH = Path(__file__).resolve().parent.parent.parent / "lm_helper" / "Condition_Validation_v2.xlsx"
CONDITION_RULES = None
if CONDITION_SPEC_PATH.exists():
    try:
        CONDITION_RULES = cv.load_rules(CONDITION_SPEC_PATH)
    except Exception as e:
        print(f"Warning: Failed to load Condition_Validation spec: {e}")

# Load data dictionary once at startup — same pattern as CONDITION_RULES above.
# Eliminates SELECT * FROM data_dictionary (~6,962 rows) on every /validate request.
# Call reload_dict_cache() after a dictionary upload to refresh without restarting.
_LOCAL_DICT_VERSION = None
DATA_DICT = None

def _format_utc_iso(dt_val):
    """Serialize a database datetime (stored in UTC) as an ISO-8601 string with 'Z' suffix."""
    if not dt_val:
        return None
    if isinstance(dt_val, str):
        if not dt_val.endswith("Z") and "+" not in dt_val:
            return dt_val + "Z"
        return dt_val
    iso = dt_val.isoformat()
    if not iso.endswith("Z") and "+" not in iso:
        return iso + "Z"
    return iso

def _build_dict_df(rows):
    data_list = []
    for row in rows:
        r = dict(row)
        fn = (
            r.get("field_name") or r.get("Field Name") or r.get("fieldname")
            or r.get("data_field") or r.get("Data Field") or r.get("field") or ""
        )
        fl = (
            r.get("field_label") or r.get("Field Label") or r.get("fieldlabel")
            or r.get("data_label") or r.get("Data Label") or r.get("label") or ""
        )
        dt = (
            r.get("data_type") or r.get("Data Type") or r.get("datatype")
            or r.get("type") or ""
        )
        fe = (
            r.get("field_enumerations") or r.get("Field Enumerations") or r.get("fieldenumerations")
            or r.get("field_enumeration") or r.get("enumerations") or r.get("enum") or ""
        )
        data_list.append({
            "Field Name": str(fn) if fn is not None else "",
            "Field Label": str(fl) if fl is not None else "",
            "Data Type": str(dt) if dt is not None else "",
            "Field Enumerations": str(fe) if fe is not None else ""
        })
    df = pd.DataFrame(data_list)
    if df.empty:
        return pd.DataFrame(columns=["Field Name", "Field Label", "Data Type", "Field Enumerations"])
    # Filter out empty or whitespace-only labels
    df = df[df["Field Label"].astype(str).str.strip() != ""].copy()
    df["_key"] = df["Field Label"].astype(str).str.strip()
    df = df.drop_duplicates("_key")
    return df.set_index("_key")

def reload_dict_cache(version=None):
    global DATA_DICT, _LOCAL_DICT_VERSION
    if not engine:
        return
    try:
        from app.database.operations import get_data_dict_version
        v = version or get_data_dict_version()
        with engine.connect() as conn:
            table_exists = conn.execute(text(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'data_dictionary'"
            )).scalar()
            if table_exists:
                rows = conn.execute(text("SELECT * FROM dbo.data_dictionary")).mappings().all()
                DATA_DICT = _build_dict_df(rows)
            else:
                DATA_DICT = _build_dict_df([])
        _LOCAL_DICT_VERSION = v
    except Exception as e:
        print(f"Warning: Failed to load data dictionary: {e}")

def ensure_dict_cache():
    global DATA_DICT, _LOCAL_DICT_VERSION
    try:
        from app.database.operations import get_data_dict_version
        db_version = get_data_dict_version()
        if _LOCAL_DICT_VERSION != db_version or DATA_DICT is None:
            reload_dict_cache(db_version)
    except Exception as e:
        print(f"Warning: Failed to check dict cache version: {e}")

try:
    ensure_dict_cache()
except Exception:
    pass


class LoanRecordInput(BaseModel):
    loan_id: Optional[str] = None
    data_field: Optional[str] = None
    data_label: Optional[str] = None
    true_data: Optional[str] = None
    dictionary_match_status: Optional[str] = None
    data_type_validation: Optional[str] = None
    data_type_remarks: Optional[str] = None
    numeric_format_flag: Optional[str] = None
    enum_validation: Optional[str] = None
    enum_remarks: Optional[str] = None
    macro_validation_result: Optional[str] = None
    result: Optional[str] = None
    condition_validation: Optional[str] = None
    condition_rule_type: Optional[str] = None
    condition_remarks: Optional[str] = None
    final_result: Optional[str] = None
    final_remarks: Optional[str] = None
    action: Optional[str] = None
    remark: Optional[str] = None
    raw_data: Optional[Dict[str, Any]] = None

class LoanSaveRequest(BaseModel):
    filename: str
    summary: Dict[str, Any]
    records: List[LoanRecordInput]
    loan_id: Optional[str] = None

@router.post("/validate")
def validate_loan_file(
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id)
):
    if not file.filename.endswith(('.xlsx', '.xls', '.xlsm')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls, .xlsm) are supported")

    try:
        contents = file.file.read()

        ensure_dict_cache()
        dictionary = DATA_DICT
        if dictionary is None or len(dictionary) == 0:
            raise HTTPException(
                status_code=400,
                detail="Data dictionary is empty in the database. Please upload a valid Data Dictionary Excel file in the Data Dictionary tab first before validating loan files."
            )

        # Load uploaded Excel
        workbook = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
        worksheet = workbook.active

        try:
            header_row = find_header_row(worksheet)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

        headers = {}
        excel_headers = []
        for cell in worksheet[header_row]:
            if cell.value is not None and str(cell.value).strip():
                h_name = str(cell.value).strip()
                headers.setdefault(h_name, cell.column)
                if h_name not in excel_headers:
                    excel_headers.append(h_name)

        for required in ("Data Field", "Data Label", "True Data"):
            if required not in headers:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing required column '{required}' in sheet '{worksheet.title}'. Found headers: {list(headers.keys())}"
                )

        name_col = headers["Data Field"]
        label_col = headers["Data Label"]
        value_col = headers["True Data"]
        loan_id_col = headers.get("Loan ID")
        first_data_row = header_row + 1

        raw_field_names = [worksheet.cell(row=r, column=name_col).value
                           for r in range(first_data_row, worksheet.max_row + 1)]
        raw_labels = [worksheet.cell(row=r, column=label_col).value
                      for r in range(first_data_row, worksheet.max_row + 1)]
        raw_values = [worksheet.cell(row=r, column=value_col).value
                      for r in range(first_data_row, worksheet.max_row + 1)]
        raw_loan_ids = ([worksheet.cell(row=r, column=loan_id_col).value
                         for r in range(first_data_row, worksheet.max_row + 1)]
                        if loan_id_col else [None] * len(raw_labels))

        # Capture all row values for all headers present in Excel
        raw_all_rows = []
        for r in range(first_data_row, worksheet.max_row + 1):
            row_dict = {}
            for h_name in excel_headers:
                c_idx = headers[h_name]
                c_val = worksheet.cell(row=r, column=c_idx).value
                row_dict[h_name] = str(c_val) if c_val is not None else ""
            raw_all_rows.append(row_dict)

        # Filter out completely blank rows
        field_names = []
        labels = []
        values = []
        loan_ids = []
        filtered_all_rows = []
        for i in range(len(raw_labels)):
            if not (is_blank(raw_field_names[i]) and is_blank(raw_labels[i]) and is_blank(raw_values[i])):
                field_names.append(raw_field_names[i])
                labels.append(raw_labels[i])
                values.append(raw_values[i])
                loan_ids.append(raw_loan_ids[i])
                filtered_all_rows.append(raw_all_rows[i])

        if not labels:
            raise HTTPException(status_code=400, detail="The Excel sheet does not contain any valid data rows.")

        # Run validation
        results = evaluate_rows(
            field_names, labels, values, dictionary, loan_ids=loan_ids,
            condition_rules=CONDITION_RULES
        )
        stats = summarize(file.filename, results, labels, dictionary)

        # Build response records list with all excel fields included
        response_records = []
        for idx, row_res in enumerate(results):
            raw_row = filtered_all_rows[idx]
            rec = {
                "loan_id": str(loan_ids[idx]) if loan_ids[idx] is not None else None,
                "data_field": str(field_names[idx]) if field_names[idx] is not None else None,
                "data_label": str(labels[idx]) if labels[idx] is not None else None,
                "true_data": str(values[idx]) if values[idx] is not None else None,
                "dictionary_match_status": row_res[0],
                "data_type_validation": row_res[1],
                "data_type_remarks": row_res[2],
                "numeric_format_flag": row_res[3],
                "enum_validation": row_res[4],
                "enum_remarks": row_res[5],
                "macro_validation_result": row_res[6],
                "result": row_res[7],
                "condition_validation": row_res[8] if len(row_res) > 8 else None,
                "condition_rule_type": row_res[9] if len(row_res) > 9 else None,
                "condition_remarks": row_res[10] if len(row_res) > 10 else None,
                "final_result": row_res[11] if len(row_res) > 11 else row_res[7],
                "final_remarks": row_res[12] if len(row_res) > 12 else "",
                "action": "",
                "remark": "",
                "raw_data": raw_row
            }
            # Merge raw_row keys into record if key not already in rec
            for k, v in raw_row.items():
                if k not in rec:
                    rec[k] = v
            response_records.append(rec)

        # Extract loan_id from row where Data Field value is 'Loan ID' (True Data value)
        extracted_loan_id = None
        for fn, val in zip(field_names, values):
            if fn and str(fn).strip().lower() in ("loan id", "loan_id", "loanid"):
                if val is not None and str(val).strip() != "":
                    extracted_loan_id = str(val).strip()
                    break

        if not extracted_loan_id:
            for lbl, val in zip(labels, values):
                if lbl and str(lbl).strip().lower() in ("loan id", "loan_id", "loanid"):
                    if val is not None and str(val).strip() != "":
                        extracted_loan_id = str(val).strip()
                        break

        if not extracted_loan_id and any(lid is not None for lid in loan_ids):
            for lid in loan_ids:
                if lid is not None and str(lid).strip() != "":
                    extracted_loan_id = str(lid).strip()
                    break

        return {
            "filename": file.filename,
            "loan_id": extracted_loan_id,
            "headers": excel_headers,
            "summary": stats,
            "records": response_records
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/save")
def save_loan_package(body: LoanSaveRequest, user_id: int = Depends(get_current_user_id)):
    if not engine:
        raise HTTPException(status_code=500, detail="Database connection not initialized")

    try:
        # Determine loan_id for this package
        loan_id_val = body.loan_id
        if not loan_id_val:
            for r in body.records:
                df_clean = str(r.data_field or '').strip().lower()
                if df_clean in ("loan id", "loan_id", "loanid"):
                    if r.true_data is not None and str(r.true_data).strip() != "":
                        loan_id_val = str(r.true_data).strip()
                        break
        if not loan_id_val:
            for r in body.records:
                dl_clean = str(r.data_label or '').strip().lower()
                if dl_clean in ("loan id", "loan_id", "loanid"):
                    if r.true_data is not None and str(r.true_data).strip() != "":
                        loan_id_val = str(r.true_data).strip()
                        break
        if not loan_id_val:
            for r in body.records:
                if r.loan_id is not None and str(r.loan_id).strip() != "":
                    loan_id_val = str(r.loan_id).strip()
                    break

        insert_package_sql = text("""
        INSERT INTO loan_packages (
            filename, loan_id, user_id, total_fields, matched, unmatched, type_pass, type_fail, blank_values,
            total_enum, enum_pass, enum_format_variance, enum_fail, enum_no_list,
            numeric_format_flagged, total_macro, macro_valid, macro_invalid,
            final_valid, final_invalid, final_blank
        )
        OUTPUT INSERTED.id
        VALUES (
            :filename, :loan_id, :user_id, :total_fields, :matched, :unmatched, :type_pass, :type_fail, :blank_values,
            :total_enum, :enum_pass, :enum_format_variance, :enum_fail, :enum_no_list,
            :numeric_format_flagged, :total_macro, :macro_valid, :macro_invalid,
            :final_valid, :final_invalid, :final_blank
        )
        """)

        summary_dict = body.summary
        params = {
            "filename": body.filename,
            "loan_id": loan_id_val,
            "user_id": user_id,
            "total_fields": int(summary_dict.get("Total Fields", 0)),
            "matched": int(summary_dict.get("Matched", 0)),
            "unmatched": int(summary_dict.get("Unmatched", 0)),
            "type_pass": int(summary_dict.get("Type Pass", 0)),
            "type_fail": int(summary_dict.get("Type Fail", 0)),
            "blank_values": int(summary_dict.get("Blank Values", 0)),
            "total_enum": int(summary_dict.get("Total Enum", 0)),
            "enum_pass": int(summary_dict.get("Enum Pass", 0)),
            "enum_format_variance": int(summary_dict.get("Enum Format Variance", 0)),
            "enum_fail": int(summary_dict.get("Enum Fail", 0)),
            "enum_no_list": int(summary_dict.get("Enum No List", 0)),
            "numeric_format_flagged": int(summary_dict.get("Numeric Format Flagged", 0)),
            "total_macro": int(summary_dict.get("Total Macro", 0)),
            "macro_valid": int(summary_dict.get("Macro Valid", 0)),
            "macro_invalid": int(summary_dict.get("Macro Invalid", 0)),
            "final_valid": int(summary_dict.get("Final Valid", 0)),
            "final_invalid": int(summary_dict.get("Final Invalid", 0)),
            "final_blank": int(summary_dict.get("Final Blank", 0))
        }

        insert_record_sql = text("""
        INSERT INTO loan_package_records (
            package_id, loan_id, data_field, data_label, true_data,
            dictionary_match_status, data_type_validation, data_type_remarks,
            numeric_format_flag, enum_validation, enum_remarks,
            macro_validation_result, result,
            final_result, final_remarks,
            condition_validation, condition_rule_type, condition_remarks,
            action, remark, raw_data
        )
        VALUES (
            :package_id, :loan_id, :data_field, :data_label, :true_data,
            :dictionary_match_status, :data_type_validation, :data_type_remarks,
            :numeric_format_flag, :enum_validation, :enum_remarks,
            :macro_validation_result, :result,
            :final_result, :final_remarks,
            :condition_validation, :condition_rule_type, :condition_remarks,
            :action, :remark, :raw_data
        )
        """)

        def _do_save():
            with engine.begin() as conn:
                pkg_id = conn.execute(insert_package_sql, params).scalar()

                # Bulk insert records in chunks
                chunk_size = 1000
                for i in range(0, len(body.records), chunk_size):
                    chunk = body.records[i:i + chunk_size]
                    record_params = []
                    for r in chunk:
                        record_params.append({
                            "package_id": pkg_id,
                            "loan_id": str(r.loan_id) if r.loan_id is not None else None,
                            "data_field": str(r.data_field) if r.data_field is not None else None,
                            "data_label": str(r.data_label) if r.data_label is not None else None,
                            "true_data": str(r.true_data) if r.true_data is not None else None,
                            "dictionary_match_status": str(r.dictionary_match_status) if r.dictionary_match_status is not None else None,
                            "data_type_validation": str(r.data_type_validation) if r.data_type_validation is not None else None,
                            "data_type_remarks": str(r.data_type_remarks) if r.data_type_remarks is not None else None,
                            "numeric_format_flag": str(r.numeric_format_flag) if r.numeric_format_flag is not None else None,
                            "enum_validation": str(r.enum_validation) if r.enum_validation is not None else None,
                            "enum_remarks": str(r.enum_remarks) if r.enum_remarks is not None else None,
                            "macro_validation_result": str(r.macro_validation_result) if r.macro_validation_result is not None else None,
                            "result": str(r.result) if r.result is not None else None,
                            "final_result": str(r.final_result) if r.final_result is not None else (str(r.result) if r.result is not None else None),
                            "final_remarks": str(r.final_remarks) if r.final_remarks is not None else None,
                            "condition_validation": str(r.condition_validation) if r.condition_validation is not None else None,
                            "condition_rule_type": str(r.condition_rule_type) if r.condition_rule_type is not None else None,
                            "condition_remarks": str(r.condition_remarks) if r.condition_remarks is not None else None,
                            "action": str(r.action) if r.action is not None else None,
                            "remark": str(r.remark) if r.remark is not None else None,
                            "raw_data": json.dumps(r.raw_data) if r.raw_data else None
                        })
                    conn.execute(insert_record_sql, record_params)
                return pkg_id

        package_id = _retry_on_deadlock(_do_save)

        # Build response from request body — avoids a full re-SELECT of all inserted rows
        saved_records = []
        for r in body.records:
            rd = {
                "package_id": package_id,
                "loan_id": str(r.loan_id) if r.loan_id is not None else None,
                "data_field": str(r.data_field) if r.data_field is not None else None,
                "data_label": str(r.data_label) if r.data_label is not None else None,
                "true_data": str(r.true_data) if r.true_data is not None else None,
                "dictionary_match_status": str(r.dictionary_match_status) if r.dictionary_match_status is not None else None,
                "data_type_validation": str(r.data_type_validation) if r.data_type_validation is not None else None,
                "data_type_remarks": str(r.data_type_remarks) if r.data_type_remarks is not None else None,
                "numeric_format_flag": str(r.numeric_format_flag) if r.numeric_format_flag is not None else None,
                "enum_validation": str(r.enum_validation) if r.enum_validation is not None else None,
                "enum_remarks": str(r.enum_remarks) if r.enum_remarks is not None else None,
                "macro_validation_result": str(r.macro_validation_result) if r.macro_validation_result is not None else None,
                "result": str(r.result) if r.result is not None else None,
                "final_result": str(r.final_result) if r.final_result is not None else (str(r.result) if r.result is not None else None),
                "final_remarks": str(r.final_remarks) if r.final_remarks is not None else None,
                "condition_validation": str(r.condition_validation) if r.condition_validation is not None else None,
                "condition_rule_type": str(r.condition_rule_type) if r.condition_rule_type is not None else None,
                "condition_remarks": str(r.condition_remarks) if r.condition_remarks is not None else None,
                "action": str(r.action) if r.action is not None else None,
                "remark": str(r.remark) if r.remark is not None else None,
                "raw_data": r.raw_data,
            }
            if isinstance(r.raw_data, dict):
                for k, v in r.raw_data.items():
                    if k not in rd:
                        rd[k] = v
            saved_records.append(rd)

        return {"status": "success", "package_id": package_id, "records": saved_records}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
def get_saved_packages(user_id: int = Depends(get_current_user_id)):
    if not engine:
        raise HTTPException(status_code=500, detail="Database connection not initialized")

    try:
        with engine.connect() as conn:
            user_row = conn.execute(
                text("SELECT role FROM users WHERE id = :id"), {"id": user_id}
            ).fetchone()
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")
            role = user_row[0]

            query = """
            SELECT lp.*, u.username as uploaded_by, u.email as uploaded_email
            FROM loan_packages lp
            LEFT JOIN users u ON lp.user_id = u.id
            """
            params = {}
            if role != "admin":
                query += " WHERE lp.user_id = :user_id"
                params["user_id"] = user_id
            query += " ORDER BY lp.uploaded_at DESC"

            result = conn.execute(text(query), params).mappings().all()
            packages = []
            for row in result:
                p = dict(row)
                if p.get("uploaded_at"):
                    p["uploaded_at"] = _format_utc_iso(p["uploaded_at"])
                packages.append(p)

        return {"status": "success", "packages": packages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{package_id}")
def get_package_details(package_id: int, user_id: int = Depends(get_current_user_id)):
    if not engine:
        raise HTTPException(status_code=500, detail="Database connection not initialized")

    try:
        with engine.connect() as conn:
            user_row = conn.execute(
                text("SELECT role FROM users WHERE id = :id"), {"id": user_id}
            ).fetchone()
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")
            role = user_row[0]

            # Get the package (with uploader info via JOIN)
            lp = conn.execute(
                text("""
                    SELECT lp.*, u.username AS uploaded_by, u.email AS uploaded_email
                    FROM loan_packages lp
                    LEFT JOIN users u ON lp.user_id = u.id
                    WHERE lp.id = :id
                """),
                {"id": package_id}
            ).mappings().first()

            if not lp:
                raise HTTPException(status_code=404, detail="Package not found")

            # Check authorization
            if role != "admin" and lp["user_id"] != user_id:
                raise HTTPException(status_code=403, detail="Not authorized to access this package")

            # Get the records
            records_rows = conn.execute(
                text("SELECT * FROM loan_package_records WHERE package_id = :package_id"),
                {"package_id": package_id}
            ).mappings().all()

            summary = {
                "Total Fields": lp["total_fields"],
                "Matched": lp["matched"],
                "Unmatched": lp["unmatched"],
                "Type Pass": lp["type_pass"],
                "Type Fail": lp["type_fail"],
                "Blank Values": lp["blank_values"],
                "Total Enum": lp["total_enum"],
                "Enum Pass": lp["enum_pass"],
                "Enum Format Variance": lp["enum_format_variance"],
                "Enum Fail": lp["enum_fail"],
                "Enum No List": lp["enum_no_list"],
                "Numeric Format Flagged": lp["numeric_format_flagged"],
                "Total Macro": lp["total_macro"],
                "Macro Valid": lp["macro_valid"],
                "Macro Invalid": lp["macro_invalid"],
                "Final Valid": lp["final_valid"],
                "Final Invalid": lp["final_invalid"],
                "Final Blank": lp["final_blank"]
            }

            records = []
            for r in records_rows:
                rd = dict(r)
                raw_str = rd.get("raw_data")
                if raw_str:
                    try:
                        raw_dict = json.loads(raw_str)
                        rd["raw_data"] = raw_dict
                        if isinstance(raw_dict, dict):
                            for k, v in raw_dict.items():
                                if k not in rd:
                                    rd[k] = v
                    except Exception:
                        pass
                records.append(rd)

            # Calculate condition validation counts and overall statistics from records
            def _get_val(rec, key1, key2):
                v = rec.get(key1)
                if v is not None and str(v).strip() != "":
                    return str(v).strip()
                raw = rec.get("raw_data")
                if isinstance(raw, dict):
                    v2 = raw.get(key2) or raw.get(key1)
                    if v2 is not None and str(v2).strip() != "":
                        return str(v2).strip()
                return ""

            cond_valid = sum(1 for r in records if _get_val(r, "condition_validation", "Condition Validation") == "Valid")
            cond_partial = sum(1 for r in records if _get_val(r, "condition_validation", "Condition Validation") == "Valid - partial")
            cond_invalid = sum(1 for r in records if _get_val(r, "condition_validation", "Condition Validation") == "Invalid")
            cond_not_auto = sum(1 for r in records if _get_val(r, "condition_validation", "Condition Validation") == "Not Automated")
            cond_no_rule = sum(1 for r in records if _get_val(r, "condition_validation", "Condition Validation") == "N/A - no condition rule")
            cond_not_met = sum(1 for r in records if _get_val(r, "condition_validation", "Condition Validation") == "N/A - condition not met")
            cond_blank = sum(1 for r in records if _get_val(r, "condition_validation", "Condition Validation") == "N/A - blank value")
            cond_info = sum(1 for r in records if _get_val(r, "condition_validation", "Condition Validation") == "N/A - informational")
            total_rec = len(records)
            cond_known = cond_valid + cond_partial + cond_invalid + cond_not_auto + cond_no_rule + cond_not_met + cond_blank + cond_info
            cond_unclass = total_rec - cond_known

            summary.update({
                "Cond Valid": cond_valid,
                "Cond Valid - Partial": cond_partial,
                "Cond Invalid": cond_invalid,
                "Cond Not Automated": cond_not_auto,
                "Cond N/A - No Rule": cond_no_rule,
                "Cond N/A - Condition Not Met": cond_not_met,
                "Cond N/A - Blank Value": cond_blank,
                "Cond N/A - Informational": cond_info,
                "Cond Unclassified": cond_unclass,
                "Cond Rules Applied": cond_valid + cond_partial + cond_invalid + cond_not_auto,
                "Cond Total (reconciles)": total_rec,
                "Overall Valid": sum(1 for r in records if _get_val(r, "final_result", "Final Result") == "Valid"),
                "Overall Invalid": sum(1 for r in records if _get_val(r, "final_result", "Final Result") == "Invalid"),
                "Overall Review Required": sum(1 for r in records if _get_val(r, "final_result", "Final Result") == "Review Required"),
                "Overall Not Validated": sum(1 for r in records if _get_val(r, "final_result", "Final Result") == "Not Validated"),
            })

        # Determine loan_id for this package
        lp_dict = dict(lp)
        loan_id_val = lp_dict.get("loan_id")
        if not loan_id_val:
            for r in records:
                f = str(r.get("data_field") or "").strip().lower()
                if f in ("loan id", "loan_id", "loanid") and r.get("true_data"):
                    loan_id_val = str(r["true_data"]).strip()
                    break

        return {
            "status": "success",
            "package": {
                "id": lp["id"],
                "filename": lp["filename"],
                "loan_id": loan_id_val,
                "uploaded_at": _format_utc_iso(lp["uploaded_at"]) if lp["uploaded_at"] else None,
                "uploaded_by_id": lp["user_id"],
                "uploaded_by": lp.get("uploaded_by"),
                "uploaded_email": lp.get("uploaded_email"),
            },
            "loan_id": loan_id_val,
            "uploaded_by": lp.get("uploaded_by"),
            "uploaded_email": lp.get("uploaded_email"),
            "summary": summary,
            "records": records
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/clear-all")
def delete_all_packages(user_id: int = Depends(get_current_user_id)):
    if not engine:
        raise HTTPException(status_code=500, detail="Database connection not initialized")

    with engine.connect() as conn:
        user_row = conn.execute(
            text("SELECT role FROM users WHERE id = :id"), {"id": user_id}
        ).fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")
        role = user_row[0]

    def _do_delete_all():
        with engine.begin() as conn:
            if role == "admin":
                # Acquire table-level exclusive lock on parent first — same order as INSERT
                conn.execute(text("SELECT TOP 0 id FROM loan_packages WITH (TABLOCKX, HOLDLOCK)"))
                conn.execute(text("DELETE FROM loan_package_records"))
                conn.execute(text("DELETE FROM loan_packages"))
            else:
                conn.execute(
                    text("DELETE FROM loan_package_records WHERE package_id IN (SELECT id FROM loan_packages WHERE user_id = :user_id)"),
                    {"user_id": user_id}
                )
                conn.execute(
                    text("DELETE FROM loan_packages WHERE user_id = :user_id"),
                    {"user_id": user_id}
                )

    try:
        _retry_on_deadlock(_do_delete_all)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "success", "message": "All packages deleted successfully"}

@router.delete("/{package_id}")
def delete_package(package_id: int, user_id: int = Depends(get_current_user_id)):
    if not engine:
        raise HTTPException(status_code=500, detail="Database connection not initialized")

    with engine.connect() as conn:
        user_row = conn.execute(
            text("SELECT role FROM users WHERE id = :id"), {"id": user_id}
        ).fetchone()
        role = user_row[0] if user_row else "user"

    def _do_delete():
        with engine.begin() as conn:
            # UPDLOCK: auth check and delete are atomic — eliminates the TOCTOU gap
            lp = conn.execute(
                text("SELECT user_id FROM loan_packages WITH (UPDLOCK) WHERE id = :id"),
                {"id": package_id}
            ).mappings().first()
            if not lp:
                raise HTTPException(status_code=404, detail="Package not found")
            if role != "admin" and lp["user_id"] != user_id:
                raise HTTPException(status_code=403, detail="Not authorized to delete this package")
            conn.execute(
                text("DELETE FROM loan_package_records WHERE package_id = :package_id"),
                {"package_id": package_id}
            )
            conn.execute(
                text("DELETE FROM loan_packages WHERE id = :id"),
                {"id": package_id}
            )

    try:
        _retry_on_deadlock(_do_delete)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "success", "message": "Package deleted successfully"}

@router.put("/{package_id}/records")
def update_package_records(
    package_id: int,
    payload: Dict[str, Any],
    user_id: int = Depends(get_current_user_id)
):
    if not engine:
        raise HTTPException(status_code=500, detail="Database connection not initialized")

    records = payload.get("records", [])

    with engine.connect() as conn:
        lp = conn.execute(
            text("SELECT user_id FROM loan_packages WHERE id = :id"),
            {"id": package_id}
        ).mappings().first()
        if not lp:
            raise HTTPException(status_code=404, detail="Package not found")
        user_row = conn.execute(
            text("SELECT role FROM users WHERE id = :id"), {"id": user_id}
        ).fetchone()
        role = user_row[0] if user_row else "user"
        if role != "admin" and lp["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to update this package")

    def _do_update():
        with engine.begin() as conn:
            # UPDLOCK prevents S→X upgrade deadlock when concurrent saves are in flight
            lp_check = conn.execute(
                text("SELECT user_id FROM loan_packages WITH (UPDLOCK) WHERE id = :id"),
                {"id": package_id}
            ).mappings().first()
            if not lp_check:
                return

            # Split OR predicate into 3 targeted index seeks — avoids full-table scan locking
            by_id: list = []
            by_field_with_loan: list = []
            by_field_null_loan: list = []
            for r in records:
                rec_id = r.get("id")
                try:
                    rec_id = int(rec_id) if rec_id is not None else None
                except (ValueError, TypeError):
                    rec_id = None
                base = {"package_id": package_id, "action": r.get("action"), "remark": r.get("remark")}
                if rec_id is not None:
                    by_id.append({**base, "record_id": rec_id})
                elif r.get("loan_id") is not None:
                    by_field_with_loan.append({**base, "data_field": r.get("data_field"), "loan_id": r.get("loan_id")})
                else:
                    by_field_null_loan.append({**base, "data_field": r.get("data_field")})

            if by_id:
                conn.execute(
                    text("UPDATE loan_package_records SET action=:action, remark=:remark WHERE package_id=:package_id AND id=:record_id"),
                    by_id
                )
            if by_field_with_loan:
                conn.execute(
                    text("UPDATE loan_package_records SET action=:action, remark=:remark WHERE package_id=:package_id AND data_field=:data_field AND loan_id=:loan_id"),
                    by_field_with_loan
                )
            if by_field_null_loan:
                conn.execute(
                    text("UPDATE loan_package_records SET action=:action, remark=:remark WHERE package_id=:package_id AND data_field=:data_field AND loan_id IS NULL"),
                    by_field_null_loan
                )
            # engine.begin() auto-commits here — UPDLOCK released

    try:
        _retry_on_deadlock(_do_update)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "success", "message": "Package records updated successfully"}
