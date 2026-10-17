import io
import json
import math
import re
from fastapi import APIRouter, UploadFile, File, HTTPException, Query, Depends
from sqlalchemy import text
from app.database.connection import engine
from app.security import get_current_user_id
from app.database.operations import (
    get_data_dict_version,
    bump_data_dict_version,
    get_user_column_preferences,
    save_user_column_preferences
)
import pandas as pd

router = APIRouter(
    prefix="/api/data-dictionary",
    tags=["Data Dictionary"]
)

# Fixed column list matching the live database schema exactly (truedataqc_ddl.txt).
# Do not change without a corresponding DB migration.
_DD_ALL_COLUMNS = [
    "field_name", "field_label", "data_type", "field_enumerations",
    "page_source", "actions", "unnamed_0", "allow_tape_map", "add_to_guideline_library",
    "true_data", "compare_data", "display_type", "field_description", "custom_field_description",
    "active", "page", "doc_exists", "reports", "category"
]
_DD_ALL_COLUMNS_SET = set(_DD_ALL_COLUMNS)
_VALID_SORT_COLS = _DD_ALL_COLUMNS_SET | {"id", "created_at"}

# Column names and filter options cached per worker, invalidated via database versioning.
_DICT_META_CACHE = {"version": None, "columns": None, "filter_options": None}


def _map_excel_to_db_col(col_name: str) -> str | None:
    """
    Map an Excel header to the matching DB column name.
    Returns None if the header does not correspond to any column in the live schema.
    """
    raw = str(col_name).strip()
    norm = re.sub(r'[\s\-_]+', '_', raw.lower()).strip('_')

    # Explicit aliases for core columns whose Excel headers vary
    if norm in ("field_name", "fieldname", "data_field", "datafield", "field"):
        candidate = "field_name"
    elif norm in ("field_label", "fieldlabel", "data_label", "datalabel", "label"):
        candidate = "field_label"
    elif norm in ("data_type", "datatype", "type"):
        candidate = "data_type"
    elif norm in ("field_enumerations", "fieldenumerations", "field_enumeration",
                  "enumerations", "enumeration", "enums", "enum", "allowed_values"):
        candidate = "field_enumerations"
    else:
        clean = re.sub(r'[^a-zA-Z0-9_]', '_', norm)
        candidate = re.sub(r'_+', '_', clean).strip('_')

    return candidate if candidate in _DD_ALL_COLUMNS_SET else None


def _reload_dict_meta_cache(version=None):
    global _DICT_META_CACHE
    if not engine:
        return
    try:
        with engine.connect() as conn:
            table_exists = conn.execute(text(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'data_dictionary'"
            )).scalar()
            if not table_exists:
                _DICT_META_CACHE = {
                    "version": version or get_data_dict_version(),
                    "columns": [],
                    "filter_options": {}
                }
                return

            # Schema is fixed; no INFORMATION_SCHEMA column query needed.
            columns = ["id"] + _DD_ALL_COLUMNS + ["created_at"]

            filter_options = {}
            for col in _DD_ALL_COLUMNS:
                try:
                    distinct_vals = conn.execute(text(f"""
                        SELECT DISTINCT TOP 100 [{col}]
                        FROM dbo.data_dictionary
                        WHERE [{col}] IS NOT NULL AND [{col}] != ''
                        ORDER BY [{col}] ASC
                    """)).scalars().all()
                    filter_options[col] = [str(v) for v in distinct_vals if v is not None]
                except Exception:
                    filter_options[col] = []

            _DICT_META_CACHE = {
                "version": version or get_data_dict_version(),
                "columns": columns,
                "filter_options": filter_options
            }
    except Exception as e:
        print(f"Warning: Failed to load data dictionary metadata: {e}")


def ensure_dict_meta_cache():
    global _DICT_META_CACHE
    db_version = get_data_dict_version()
    if _DICT_META_CACHE.get("version") != db_version or _DICT_META_CACHE.get("columns") is None:
        _reload_dict_meta_cache(db_version)
    return _DICT_META_CACHE


# Initialize on module load
try:
    ensure_dict_meta_cache()
except Exception:
    pass


@router.post("/upload")
async def upload_data_dictionary(
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id)
):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported")

    try:
        contents = await file.read()
        excel_file = io.BytesIO(contents)
        xl = pd.ExcelFile(excel_file)

        target_sheet = xl.sheet_names[0]
        for s in xl.sheet_names:
            s_lower = s.lower()
            if any(k in s_lower for k in ["ag-grid", "dict", "data", "sheet1"]):
                target_sheet = s
                break

        # keep_default_na=False preserves "NA", "N/A", "None" as literal strings (not NaN)
        df = xl.parse(target_sheet, keep_default_na=False, na_values=[""])
        df = df.fillna("")

        if df.empty:
            raise HTTPException(status_code=400, detail="Uploaded Excel file is empty")

        if not engine:
            raise HTTPException(status_code=500, detail="Database connection not initialized")

        # Map each Excel column to a DB column; first match per DB column wins, extras are skipped.
        col_mapping = {}   # db_col → excel_col
        for excel_col in df.columns:
            db_col = _map_excel_to_db_col(excel_col)
            if db_col and db_col not in col_mapping:
                col_mapping[db_col] = excel_col

        if not col_mapping:
            raise HTTPException(
                status_code=400,
                detail="No Excel columns matched the data dictionary schema. "
                       f"Expected columns like: {', '.join(_DD_ALL_COLUMNS[:6])}, ..."
            )

        db_cols = list(col_mapping.keys())
        insert_cols = ", ".join(f"[{c}]" for c in db_cols)
        insert_params = ", ".join(f":{c}" for c in db_cols)
        insert_query = text(
            f"INSERT INTO dbo.data_dictionary ({insert_cols}) VALUES ({insert_params})"
        )

        records = df.to_dict(orient="records")
        params = []
        for r in records:
            row = {}
            for db_col, excel_col in col_mapping.items():
                val = r.get(excel_col, "")
                row[db_col] = str(val) if val is not None else ""
            params.append(row)

        with engine.begin() as conn:
            conn.execute(text("TRUNCATE TABLE dbo.data_dictionary"))
            chunk_size = 1000
            for i in range(0, len(params), chunk_size):
                conn.execute(insert_query, params[i:i + chunk_size])

        new_version = bump_data_dict_version()
        _reload_dict_meta_cache(new_version)
        from app.routers.loans import reload_dict_cache
        reload_dict_cache(new_version)

        active_display_cols = ["id"] + db_cols
        save_user_column_preferences(user_id, "data_dictionary", active_display_cols)

        return {
            "status": "success",
            "message": f"Successfully uploaded {len(params)} records with {len(db_cols)} columns.",
            "columns": ["id"] + _DD_ALL_COLUMNS + ["created_at"],
            "user_selected_columns": active_display_cols,
            "total": len(params)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
def get_data_dictionary(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=500000),
    search: str = Query(None, description="Search across columns"),
    sort_by: str = Query("id", description="Column to sort by"),
    sort_order: str = Query("asc", description="Sort order (asc or desc)"),
    filters: str = Query(None, description="JSON string of column filters"),
    user_id: int = Depends(get_current_user_id)
):
    if not engine:
        raise HTTPException(status_code=500, detail="Database connection not initialized")

    meta = ensure_dict_meta_cache()
    columns_res = meta.get("columns") or []
    filter_options = meta.get("filter_options") or {}

    if not columns_res:
        return {
            "data": [],
            "total": 0,
            "page": page,
            "limit": limit,
            "total_pages": 0,
            "columns": [],
            "user_selected_columns": [],
            "filter_options": {}
        }

    saved_user_cols = get_user_column_preferences(user_id, "data_dictionary")
    all_display_cols = [c for c in columns_res if c != 'created_at']
    if saved_user_cols and isinstance(saved_user_cols, list):
        valid_cols = [c for c in saved_user_cols if c in set(columns_res)]
        user_selected = valid_cols if valid_cols else all_display_cols
    else:
        user_selected = all_display_cols

    if hasattr(sort_order, "default"):
        sort_order = sort_order.default or "asc"
    if hasattr(sort_by, "default"):
        sort_by = sort_by.default or "id"
    if hasattr(search, "default"):
        search = search.default
    if hasattr(filters, "default"):
        filters = filters.default

    if sort_by not in _VALID_SORT_COLS:
        sort_by = "id"
    sort_order = "DESC" if str(sort_order).lower() == "desc" else "ASC"

    where_clauses = []
    params = {}

    if search:
        search_cols = _DD_ALL_COLUMNS
        or_conditions = [f"[{c}] LIKE :search" for c in search_cols]
        where_clauses.append("(" + " OR ".join(or_conditions) + ")")
        params["search"] = f"%{search}%"

    if filters:
        try:
            filter_dict = json.loads(filters)
            if isinstance(filter_dict, dict):
                f_idx = 0
                filterable = _DD_ALL_COLUMNS_SET | {"id"}
                for col_name, val in filter_dict.items():
                    if col_name not in filterable:
                        continue
                    if isinstance(val, list) and val:
                        param_names = []
                        for item in val:
                            p_name = f"f_{f_idx}"
                            param_names.append(f":{p_name}")
                            params[p_name] = str(item)
                            f_idx += 1
                        where_clauses.append(f"[{col_name}] IN ({', '.join(param_names)})")
                    elif isinstance(val, str) and val.strip():
                        p_name = f"f_{f_idx}"
                        where_clauses.append(f"[{col_name}] LIKE :{p_name}")
                        params[p_name] = f"%{val.strip()}%"
                        f_idx += 1
        except Exception:
            pass

    where_clause = ""
    if where_clauses:
        where_clause = "WHERE " + " AND ".join(where_clauses)

    with engine.connect() as conn:
        count_query = f"SELECT COUNT(*) FROM dbo.data_dictionary {where_clause}"
        total_records = conn.execute(text(count_query), params).scalar()

        offset = (page - 1) * limit
        data_query = f"""
        SELECT *
        FROM dbo.data_dictionary
        {where_clause}
        ORDER BY [{sort_by}] {sort_order}
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        """
        params["offset"] = offset
        params["limit"] = limit

        result = conn.execute(text(data_query), params).mappings().all()
        data = [dict(row) for row in result]

    return {
        "data": data,
        "total": total_records,
        "page": page,
        "limit": limit,
        "total_pages": math.ceil(total_records / limit) if total_records else 0,
        "columns": list(columns_res),
        "user_selected_columns": user_selected,
        "filter_options": filter_options
    }


@router.delete("/clear-all")
def delete_all_data_dictionary(user_id: int = Depends(get_current_user_id)):
    if not engine:
        raise HTTPException(status_code=500, detail="Database connection not initialized")

    try:
        with engine.begin() as conn:
            table_exists = conn.execute(text(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'data_dictionary'"
            )).scalar()
            if table_exists:
                conn.execute(text("TRUNCATE TABLE dbo.data_dictionary"))

        new_version = bump_data_dict_version()
        _reload_dict_meta_cache(new_version)
        from app.routers.loans import reload_dict_cache
        reload_dict_cache(new_version)

        return {"status": "success", "message": "All data dictionary records deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
