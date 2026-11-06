-- Performance indexes and schema corrections.
-- Run by DBA against the target database. Safe to re-run (IF NOT EXISTS / DECLARE guards).
-- Do NOT execute from the application.
-- IMPORTANT: change the USE statement to match the target database before running:
--   Production : USE truedata_qc_db
--   UAT        : USE ops_qc_db
--   QA (local) : USE qa_ops_qc_db

USE truedata_qc_db;

-- ============================================================
-- 0. users — drop UNIQUE constraint on username, add non-unique index
-- Usernames are display names; only email must be unique.
-- The UNIQUE constraint blocks registration when two people share a name.
-- ============================================================
DECLARE @uq_username NVARCHAR(200) = NULL;
SELECT @uq_username = kc.name
FROM sys.key_constraints kc
JOIN sys.index_columns ic ON kc.unique_index_id = ic.index_id AND kc.parent_object_id = ic.object_id
JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
WHERE OBJECT_NAME(kc.parent_object_id) = 'users' AND kc.type = 'UQ' AND c.name = 'username';
IF @uq_username IS NOT NULL
    EXEC('ALTER TABLE dbo.users DROP CONSTRAINT [' + @uq_username + ']');

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.users')
      AND name = 'IX_users_username'
)
    CREATE NONCLUSTERED INDEX IX_users_username
    ON dbo.users (username ASC);

-- ============================================================
-- 1. loan_package_records — composite deadlock-fix index
-- Covers every read/update/delete (package_id seek), ON DELETE CASCADE,
-- and the split-OR update pattern in update_package_records.
-- SQL Server cannot index NVARCHAR(MAX) columns, so narrow data_field first.
-- Drop the old single-column index (made redundant — composite leads with same column).
-- ============================================================

-- Narrow data_field from MAX to 200 so it can be an index key column.
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.loan_package_records')
      AND name = 'data_field'
      AND max_length = -1
)
    ALTER TABLE dbo.loan_package_records ALTER COLUMN data_field NVARCHAR(200);

-- Drop old single-column index if still present.
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.loan_package_records')
      AND name = 'IX_loan_package_records_package_id'
)
    DROP INDEX IX_loan_package_records_package_id ON dbo.loan_package_records;

-- Create composite covering index (deadlock fix from v9/v10).
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.loan_package_records')
      AND name = 'IX_loan_package_records_lookup'
)
    CREATE NONCLUSTERED INDEX IX_loan_package_records_lookup
    ON dbo.loan_package_records (package_id ASC, data_field ASC, loan_id ASC)
    INCLUDE (id);

-- ============================================================
-- 2. loan_packages (user_id, uploaded_at DESC)
-- Non-admin GET /loans filters WHERE user_id = :id ORDER BY uploaded_at DESC.
-- Composite covers both the seek and the sort in a single index scan.
-- ============================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.loan_packages')
      AND name = 'IX_loan_packages_user_uploaded'
)
    CREATE NONCLUSTERED INDEX IX_loan_packages_user_uploaded
    ON dbo.loan_packages (user_id ASC, uploaded_at DESC);

-- ============================================================
-- 3. loan_packages (uploaded_at DESC)
-- Admin GET /loans returns all rows ORDER BY uploaded_at DESC.
-- Without this, SQL Server sorts the entire table on every request.
-- ============================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.loan_packages')
      AND name = 'IX_loan_packages_uploaded_at'
)
    CREATE NONCLUSTERED INDEX IX_loan_packages_uploaded_at
    ON dbo.loan_packages (uploaded_at DESC);

-- ============================================================
-- 4. audit_logs (timestamp)
-- Purge query: DELETE WHERE timestamp < DATEADD(day, -N, GETUTCDATE())
-- Without this, purge scans the entire audit_logs table on every startup.
-- ============================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.audit_logs')
      AND name = 'IX_audit_logs_timestamp'
)
    CREATE NONCLUSTERED INDEX IX_audit_logs_timestamp
    ON dbo.audit_logs ([timestamp] ASC);
