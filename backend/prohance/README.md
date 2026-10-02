# Prohance Package Time Reporting API

Uploads a Prohance "All Activities By User Details" CSV export, maps every
Adobe Acrobat / Lauramac action to its underlying loan package, stores the
raw file and all 5 report tabs in SQL Server, and returns the same data as
JSON for a 5-tab dashboard UI.

## Project layout

```
prohance_api/
  app/
    main.py          FastAPI app + routes
    processing.py     All the CSV parsing / mapping / aggregation logic
    models.py          SQLAlchemy ORM tables
    database.py         Engine/session setup (SQL Server or SQLite)
    repository.py        Save/load between DataFrames and the DB
    schemas.py             Pydantic request/response models
  sql/
    create_tables.sql   Plain DDL, for DBAs who prefer manual migrations
  requirements.txt
```

## Setup

```bash
pip install -r requirements.txt
```

`pyodbc` additionally requires the **ODBC Driver 17 (or 18) for SQL Server**
installed on the host OS - it is a native driver, not a pure-Python package.
On Ubuntu:

```bash
curl https://packages.microsoft.com/keys/microsoft.asc | sudo apt-key add -
curl https://packages.microsoft.com/config/ubuntu/22.04/prod.list | sudo tee /etc/apt/sources.list.d/mssql-release.list
sudo apt-get update
sudo ACCEPT_EULA=Y apt-get install -y msodbcsql18
```

## Configuration

Set `DATABASE_URL` before starting the app:

```bash
# SQL Server (production)
export DATABASE_URL="mssql+pyodbc://<user>:<password>@<host>:1433/<database>?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes"

# SQLite (local dev/testing - no SQL Server needed)
export DATABASE_URL="sqlite:///./prohance.db"
```

If `DATABASE_URL` is not set, it defaults to the SQLite option above so the
API is runnable immediately during development.

Tables are created automatically on startup (`app.database.init_db()`). If
your organization prefers a DBA-reviewed migration instead, run
`sql/create_tables.sql` against the target database yourself and it will be
skipped (the `IF OBJECT_ID(...) IS NULL` guards make it idempotent either way).

## Run

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Interactive API docs (Swagger UI) are then available at
`http://localhost:8000/docs`.

## Endpoints

| Method | Path                                    | Purpose                                                        |
|--------|------------------------------------------|-----------------------------------------------------------------|
| POST   | `/api/prohance/reports`                 | Upload a CSV, process it, persist it, return all 5 tabs        |
| GET    | `/api/prohance/reports`                 | List past reports (for a report-history picker)                |
| GET    | `/api/prohance/reports/{report_id}`     | Re-fetch a past report's 5 tabs without reprocessing            |
| GET    | `/api/prohance/reports/{report_id}/raw-file` | Download the original uploaded CSV, verbatim               |
| DELETE | `/api/prohance/reports/{report_id}`     | Delete a report and all its tab rows                            |

### Example: upload

```bash
curl -X POST "http://localhost:8000/api/prohance/reports" \
  -F "file=@All_Activities_By_User_Details_Report.csv;type=text/csv"
```

### Response shape (both POST and GET-by-id)

```json
{
  "report_id": 1,
  "original_filename": "All_Activities_By_User_Details_Report.csv",
  "uploaded_at": "2026-08-18T08:08:05Z",
  "processed_at": "2026-08-18T08:08:05Z",
  "status": "COMPLETED",
  "stats": {
    "rows_processed": 140630,
    "pdf_rows": 45037,
    "lauramac_rows": 46242,
    "packages_found": 1194,
    "rows_unmapped": 1276,
    "rows_unverified": 2889,
    "report_period": "12 Aug 2026"
  },
  "tabs": {
    "package_time_summary": [ { "File #": "...", "User Name": "...", "...": "..." } ],
    "unmapped_requires_review": [ ... ],
    "unverified_requires_review": [ ... ],
    "overall_activity_summary": [ ... ],
    "overall_by_user": [ ... ]
  }
}
```

The UI should render one tab per key under `tabs`, in the order:
`package_time_summary` -> `unmapped_requires_review` ->
`unverified_requires_review` -> `overall_activity_summary` -> `overall_by_user`.

## Mapping logic (unchanged from the standalone script)

- **Unmapped - Requires Review**: activity with *no* File # at all - either
  the PDF filename had no usable digit sequence, multiple candidate loan
  numbers matched different Lauramac visits (ambiguous), or the Lauramac URL
  was general navigation (dashboard, pending loans, etc.) with no
  package-specific segment. Excluded entirely from package totals.
- **Unverified - Requires Review**: a File # *was* assigned to a PDF row
  (using the standard "leading digits" filename convention), but there was
  no Lauramac visit by that same user that day to cross-check it against.
  Still included in package totals, but flagged so someone can confirm it.
- **Package Time Summary**: File #, User Name, Session Date, PDF Time,
  Lauramac Time, Total Time, plus how many distinct users touched that File
  # and the combined total across all of them.
- **Overall Activity Summary / Overall by User**: time spent per
  Activity Name/Activity Text, org-wide and per-user respectively, each
  carrying the same File # + cross-user totals so rows can be filtered and
  reconciled against the Package Time Summary.

## Testing without a live SQL Server

```bash
DATABASE_URL="sqlite:///./prohance.db" uvicorn app.main:app --reload
```

The exact same code path (SQLAlchemy ORM, no backend-specific SQL) runs
against SQLite; only `DATABASE_URL` changes when pointing at real SQL Server.
