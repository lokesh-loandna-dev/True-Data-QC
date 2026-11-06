-- =============================================================================
-- Migration script: bring ldprodazsqldbsrv02 (production) to QA level
-- Based on: qa_ops_qc_db.sql (reference)
-- Run by DBA. Safe to re-run — every statement is guarded by IF NOT EXISTS /
-- IF EXISTS / dynamic constraint lookups. No data is modified except where noted.
-- =============================================================================

USE [ldprodazsqldbsrv02];
GO

-- =============================================================================
-- SECTION 1 — users table
-- Changes: drop UNIQUE on username, add status column, add non-unique index
-- =============================================================================

-- 1a. Drop UNIQUE constraint on username (blocks registration when names are shared).
--     Dynamic lookup handles any auto-generated constraint name.
DECLARE @uq_username NVARCHAR(200) = NULL;
SELECT @uq_username = kc.name
FROM sys.key_constraints kc
JOIN sys.index_columns ic
    ON kc.unique_index_id = ic.index_id AND kc.parent_object_id = ic.object_id
JOIN sys.columns c
    ON ic.object_id = c.object_id AND ic.column_id = c.column_id
WHERE OBJECT_NAME(kc.parent_object_id) = 'users'
  AND kc.type = 'UQ'
  AND c.name = 'username';
IF @uq_username IS NOT NULL
    EXEC('ALTER TABLE dbo.users DROP CONSTRAINT [' + @uq_username + ']');
GO

-- 1b. Add status column (inactive by default; existing users set to active so
--     they are not locked out after the migration).
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.users') AND name = 'status'
)
BEGIN
    ALTER TABLE dbo.users ADD status VARCHAR(50) NOT NULL DEFAULT 'inactive';
    UPDATE dbo.users SET status = 'active' WHERE status = 'inactive';
    PRINT 'users.status column added and existing users set to active.';
END
GO

-- 1c. Non-unique index on username (supports lookup without enforcing uniqueness).
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.users') AND name = 'IX_users_username'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_users_username ON dbo.users (username ASC);
    PRINT 'IX_users_username created.';
END
GO

-- =============================================================================
-- SECTION 2 — loan_packages table
-- Changes: add loan_id, review_required, ingestion_mode columns;
--          fix uploaded_at default to SYSUTCDATETIME();
--          add performance indexes
-- =============================================================================

-- 2a. loan_id column
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.loan_packages') AND name = 'loan_id'
)
BEGIN
    ALTER TABLE dbo.loan_packages ADD loan_id NVARCHAR(100) NULL;
    PRINT 'loan_packages.loan_id column added.';
END
GO

-- 2b. review_required column
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.loan_packages') AND name = 'review_required'
)
BEGIN
    ALTER TABLE dbo.loan_packages ADD review_required INT NULL DEFAULT 0;
    PRINT 'loan_packages.review_required column added.';
END
GO

-- 2c. ingestion_mode column
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.loan_packages') AND name = 'ingestion_mode'
)
BEGIN
    ALTER TABLE dbo.loan_packages ADD ingestion_mode VARCHAR(50) NULL;
    PRINT 'loan_packages.ingestion_mode column added.';
END
GO

-- 2d. Fix uploaded_at default: getdate() -> SYSUTCDATETIME()
--     (GETDATE() returns UTC-7 on this server; app inserts SYSUTCDATETIME() explicitly
--     but the column default matters for consistency and manual inserts.)
DECLARE @df_uploaded NVARCHAR(200) = NULL;
SELECT @df_uploaded = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c
    ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.loan_packages')
  AND c.name = 'uploaded_at';
IF @df_uploaded IS NOT NULL
    EXEC('ALTER TABLE dbo.loan_packages DROP CONSTRAINT [' + @df_uploaded + ']');
ALTER TABLE dbo.loan_packages
    ADD CONSTRAINT DF_loan_packages_uploaded_at DEFAULT SYSUTCDATETIME() FOR uploaded_at;
PRINT 'loan_packages.uploaded_at default changed to SYSUTCDATETIME().';
GO

-- 2e. Index: (uploaded_at DESC) — admin list ordered by date
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.loan_packages') AND name = 'IX_loan_packages_uploaded_at'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_loan_packages_uploaded_at
        ON dbo.loan_packages (uploaded_at DESC);
    PRINT 'IX_loan_packages_uploaded_at created.';
END
GO

-- 2f. Index: (user_id ASC, uploaded_at DESC) — per-user filtered list + sort
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.loan_packages') AND name = 'IX_loan_packages_user_uploaded'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_loan_packages_user_uploaded
        ON dbo.loan_packages (user_id ASC, uploaded_at DESC);
    PRINT 'IX_loan_packages_user_uploaded created.';
END
GO

-- =============================================================================
-- SECTION 3 — loan_package_records table
-- Changes: narrow data_field MAX->200 (required for composite index key);
--          create composite deadlock-fix index
-- =============================================================================

-- 3a. Narrow data_field from MAX to 200 (SQL Server cannot index MAX columns).
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.loan_package_records')
      AND name = 'data_field'
      AND max_length = -1
)
BEGIN
    ALTER TABLE dbo.loan_package_records ALTER COLUMN data_field NVARCHAR(200);
    PRINT 'loan_package_records.data_field narrowed to NVARCHAR(200).';
END
GO

-- 3b. Drop old single-column index if still present (made redundant by composite below).
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.loan_package_records')
      AND name = 'IX_loan_package_records_package_id'
)
BEGIN
    DROP INDEX IX_loan_package_records_package_id ON dbo.loan_package_records;
    PRINT 'IX_loan_package_records_package_id dropped.';
END
GO

-- 3c. Composite covering index — covers every record lookup, ON DELETE CASCADE,
--     and the split-OR update pattern used to prevent S->X upgrade deadlocks.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.loan_package_records')
      AND name = 'IX_loan_package_records_lookup'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_loan_package_records_lookup
        ON dbo.loan_package_records (package_id ASC, data_field ASC, loan_id ASC)
        INCLUDE (id);
    PRINT 'IX_loan_package_records_lookup created.';
END
GO

-- =============================================================================
-- SECTION 4 — audit_logs table
-- Changes: fix timestamp default to SYSUTCDATETIME(); add timestamp index
-- =============================================================================

-- 4a. Fix timestamp default: getdate() -> SYSUTCDATETIME()
DECLARE @df_ts NVARCHAR(200) = NULL;
SELECT @df_ts = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c
    ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.audit_logs')
  AND c.name = 'timestamp';
IF @df_ts IS NOT NULL
    EXEC('ALTER TABLE dbo.audit_logs DROP CONSTRAINT [' + @df_ts + ']');
ALTER TABLE dbo.audit_logs
    ADD CONSTRAINT DF_audit_logs_timestamp DEFAULT SYSUTCDATETIME() FOR [timestamp];
PRINT 'audit_logs.timestamp default changed to SYSUTCDATETIME().';
GO

-- 4b. Index on timestamp — used by purge query on every startup.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.audit_logs') AND name = 'IX_audit_logs_timestamp'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_audit_logs_timestamp
        ON dbo.audit_logs ([timestamp] ASC);
    PRINT 'IX_audit_logs_timestamp created.';
END
GO

-- =============================================================================
-- SECTION 5 — password_reset_otps table (OTP password reset feature)
-- =============================================================================

IF OBJECT_ID('dbo.password_reset_otps', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.password_reset_otps (
        id          INT IDENTITY(1,1) PRIMARY KEY,
        email       VARCHAR(255) NOT NULL,
        otp_code    VARCHAR(10)  NOT NULL,
        expires_at  DATETIME     NOT NULL,
        verified    BIT          NOT NULL DEFAULT 0,
        used        BIT          NOT NULL DEFAULT 0,
        attempts    INT          NOT NULL DEFAULT 0,
        created_at  DATETIME     DEFAULT SYSUTCDATETIME()
    );
    CREATE NONCLUSTERED INDEX IX_password_reset_otps_email
        ON dbo.password_reset_otps (email ASC);
    PRINT 'password_reset_otps table and index created.';
END
GO

PRINT '=== Migration complete: ldprodazsqldbsrv02 (production) ===';
GO
