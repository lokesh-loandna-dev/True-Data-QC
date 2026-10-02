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

def sanitize_sql_identifier(col_name: str, existing_names: set) -> str:
    """
    Sanitize an Excel header name into a safe, unambiguous SQL column identifier.
    Normalizes common core names (Field Name, Field Label, Data Type, etc.) to standard keys.
    """
    raw = str(col_name).strip()
    norm = re.sub(r'[\s\-_]+', '_', raw.lower()).strip('_')

    if norm in ["field_name", "fieldname", "data_field", "datafield", "field"]:
        sql_name = "field_name"
    elif norm in ["field_label", "fieldlabel", "data_label", "datalabel", "label"]:
        sql_name = "field_label"
    elif norm in ["data_type", "datatype", "type"]:
        sql_name = "data_type"
    elif norm in ["field_enumerations", "fieldenumerations", "field_enumeration", "enumerations", "enumeration", "enums", "enum", "allowed_values"]:
        sql_name = "field_enumerations"
    elif norm in ["id", "excel_id"]:
        sql_name = "excel_id"
    elif norm in ["created_at", "excel_created_at"]:
        sql_name = "excel_created_at"
    else:
        clean = re.sub(r'[^a-zA-Z0-9_]', '_', norm)
        clean = re.sub(r'_+', '_', clean).strip('_')
        if not clean:
            clean = "column"
        sql_name = clean

    final_name = sql_name
    counter = 1
    while final_name in existing_names or final_name in ("id", "created_at"):
        final_name = f"{sql_name}_{counter}"
        counter += 1

    existing_names.add(final_name)
    return final_name

# Column names and filter options cached per worker, invalidated via database versioning.
_DICT_META_CACHE = {"version": None, "columns": None, "filter_options": None}

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

            columns = list(conn.execute(text("""
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'data_dictionary'
                ORDER BY ORDINAL_POSITION
            """)).scalars().all())

            filter_options = {}
            for col in columns:
                if col in ('id', 'created_at'):
                    continue
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
        
        # Target best matching sheet: 'ag-grid', 'dict', 'data', or first sheet
        target_sheet = xl.sheet_names[0]
        for s in xl.sheet_names:
            s_lower = s.lower()
            if any(k in s_lower for k in ["ag-grid", "dict", "data", "sheet1"]):
                target_sheet = s
                break
        
        df = xl.parse(target_sheet)
        df = df.fillna("")

        if df.empty:
            raise HTTPException(status_code=400, detail="Uploaded Excel file is empty")

        if not engine:
            raise HTTPException(status_code=500, detail="Database connection not initialized")

        # Map Excel headers to safe SQL column names
        col_mapping = {}
        existing_sql_cols = set()

        for col in df.columns:
            sql_col = sanitize_sql_identifier(col, existing_sql_cols)
            col_mapping[col] = sql_col

        # Ensure mandatory core columns always exist in the table schema
        mandatory_cols = ["field_name", "field_label", "data_type", "field_enumerations"]
        for m in mandatory_cols:
            if m not in existing_sql_cols:
                existing_sql_cols.add(m)

        # Build complete ordered list of SQL columns: mandatory first, then extra columns
        all_sql_cols = list(mandatory_cols) + [c for c in existing_sql_cols if c not in mandatory_cols]

        col_defs = ["id INT IDENTITY(1,1) PRIMARY KEY"]
        for col_name in all_sql_cols:
            col_defs.append(f"[{col_name}] NVARCHAR(MAX)")
        col_defs.append("created_at DATETIME DEFAULT CURRENT_TIMESTAMP")

        drop_create_sql = f"""
        IF OBJECT_ID('dbo.data_dictionary', 'U') IS NOT NULL DROP TABLE dbo.data_dictionary;
        CREATE TABLE dbo.data_dictionary (
            {', '.join(col_defs)}
        );
        """

        records = df.to_dict(orient="records")

        insert_cols = [f"[{col}]" for col in all_sql_cols]
        param_placeholders = [f":{col}" for col in all_sql_cols]

        insert_query = text(f"""
        INSERT INTO dbo.data_dictionary ({', '.join(insert_cols)})
        VALUES ({', '.join(param_placeholders)})
        """)

        params = []
        for r in records:
            row_dict = {}
            for orig_col, sql_col in col_mapping.items():
                val = r.get(orig_col)
                if pd.isna(val) or val is None:
                    val = ""
                row_dict[sql_col] = str(val)
            # Fill default empty strings for missing mandatory columns
            for col in all_sql_cols:
                if col not in row_dict:
                    row_dict[col] = ""
            params.append(row_dict)

        with engine.connect() as conn:
            conn.execute(text(drop_create_sql))
            conn.commit()

            chunk_size = 1000
            for i in range(0, len(params), chunk_size):
                conn.execute(insert_query, params[i:i + chunk_size])
            conn.commit()

        # Update version in DB so all workers across the process pool invalidate their caches
        new_version = bump_data_dict_version()
        _reload_dict_meta_cache(new_version)
        from app.routers.loans import reload_dict_cache
        reload_dict_cache(new_version)

        # Active columns by default: 'id' followed by all dictionary columns (excluding 'created_at')
        active_display_cols = ['id'] + [c for c in all_sql_cols if c != 'created_at']
        
        # Save as the user's preference in DB so all tabs/logins reflect all uploaded columns
        save_user_column_preferences(user_id, "data_dictionary", active_display_cols)

        return {
            "status": "success",
            "message": f"Successfully uploaded {len(records)} records with {len(all_sql_cols)} columns.",
            "columns": ['id'] + all_sql_cols + ['created_at'],
            "user_selected_columns": active_display_cols,
            "total": len(records)
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

    # Use multi-worker version-checked cache
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

    # Fetch user's saved column preferences from database
    saved_user_cols = get_user_column_preferences(user_id, "data_dictionary")
    all_display_cols = [c for c in columns_res if c != 'created_at']
    if saved_user_cols and isinstance(saved_user_cols, list):
        valid_cols = [c for c in saved_user_cols if c in columns_res]
        user_selected = valid_cols if valid_cols else all_display_cols
    else:
        user_selected = all_display_cols

    db_cols = set(columns_res)

    if hasattr(sort_order, "default"):
        sort_order = sort_order.default or "asc"
    if hasattr(sort_by, "default"):
        sort_by = sort_by.default or "id"
    if hasattr(search, "default"):
        search = search.default
    if hasattr(filters, "default"):
        filters = filters.default

    if sort_by not in db_cols:
        sort_by = "id"
    sort_order = "DESC" if str(sort_order).lower() == "desc" else "ASC"


    where_clauses = []
    params = {}

    if search:
        search_cols = [c for c in columns_res if c not in ('id', 'created_at')]
        if search_cols:
            or_conditions = [f"[{c}] LIKE :search" for c in search_cols]
            where_clauses.append("(" + " OR ".join(or_conditions) + ")")
            params["search"] = f"%{search}%"

    if filters:
        try:
            filter_dict = json.loads(filters)
            if isinstance(filter_dict, dict):
                f_idx = 0
                for col_name, val in filter_dict.items():
                    if col_name in db_cols:
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
        with engine.connect() as conn:
            table_exists = conn.execute(text(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'data_dictionary'"
            )).scalar()
            if table_exists:
                conn.execute(text("TRUNCATE TABLE dbo.data_dictionary"))
                conn.commit()

        # Update version in DB and clear local caches
        new_version = bump_data_dict_version()
        _reload_dict_meta_cache(new_version)
        from app.routers.loans import reload_dict_cache
        reload_dict_cache(new_version)

        return {"status": "success", "message": "All data dictionary records deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
