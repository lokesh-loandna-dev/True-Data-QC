-- Prohance Package Time Reporting - SQL Server schema
-- Run this against your target database if you prefer a DBA-reviewed
-- migration instead of letting the API auto-create tables (app.database.init_db()).

IF OBJECT_ID('dbo.prohance_reports', 'U') IS NULL
CREATE TABLE dbo.prohance_reports (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    original_filename   NVARCHAR(500)   NOT NULL,
    raw_file_content    VARBINARY(MAX)  NOT NULL,   -- the uploaded CSV, verbatim
    report_period       NVARCHAR(50)    NULL,
    uploaded_at         DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    processed_at        DATETIME2       NULL,
    status              NVARCHAR(20)    NOT NULL DEFAULT 'PROCESSING',  -- PROCESSING/COMPLETED/FAILED
    error_message       NVARCHAR(MAX)   NULL,
    rows_processed      INT             NULL,
    pdf_rows            INT             NULL,
    lauramac_rows       INT             NULL,
    packages_found      INT             NULL,
    rows_unmapped       INT             NULL,
    rows_unverified     INT             NULL
);

-- Tab 1: Package Time Summary
IF OBJECT_ID('dbo.prohance_package_summary', 'U') IS NULL
CREATE TABLE dbo.prohance_package_summary (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    report_id           INT NOT NULL REFERENCES dbo.prohance_reports(id) ON DELETE CASCADE,
    file_number         NVARCHAR(50)    NOT NULL,
    user_name           NVARCHAR(200)   NOT NULL,
    session_date        NVARCHAR(50)    NOT NULL,
    pdf_time_sec        FLOAT           NOT NULL,
    lauramac_time_sec   FLOAT           NOT NULL,
    total_time_sec      FLOAT           NOT NULL,
    users_on_file       INT             NOT NULL,
    file_total_sec      FLOAT           NOT NULL
);
CREATE INDEX IX_package_summary_report_id   ON dbo.prohance_package_summary(report_id);
CREATE INDEX IX_package_summary_file_number ON dbo.prohance_package_summary(file_number);

-- Tab 2: Unmapped - Requires Review
IF OBJECT_ID('dbo.prohance_unmapped_review', 'U') IS NULL
CREATE TABLE dbo.prohance_unmapped_review (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    report_id           INT NOT NULL REFERENCES dbo.prohance_reports(id) ON DELETE CASCADE,
    user_name           NVARCHAR(200)   NOT NULL,
    session_date        NVARCHAR(50)    NOT NULL,
    row_type            NVARCHAR(20)    NOT NULL,
    category_name       NVARCHAR(200)   NULL,
    activity_name       NVARCHAR(200)   NULL,
    activity_text       NVARCHAR(MAX)   NULL,
    process_name        NVARCHAR(200)   NULL,
    start_time          NVARCHAR(50)    NULL,
    end_time            NVARCHAR(50)    NULL,
    duration_sec        FLOAT           NOT NULL,
    reason              NVARCHAR(200)   NULL
);
CREATE INDEX IX_unmapped_review_report_id ON dbo.prohance_unmapped_review(report_id);

-- Tab 3: Unverified - Requires Review
IF OBJECT_ID('dbo.prohance_unverified_review', 'U') IS NULL
CREATE TABLE dbo.prohance_unverified_review (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    report_id           INT NOT NULL REFERENCES dbo.prohance_reports(id) ON DELETE CASCADE,
    user_name           NVARCHAR(200)   NOT NULL,
    session_date        NVARCHAR(50)    NOT NULL,
    file_number         NVARCHAR(50)    NULL,
    activity_text       NVARCHAR(MAX)   NULL,
    start_time          NVARCHAR(50)    NULL,
    end_time            NVARCHAR(50)    NULL,
    duration_sec        FLOAT           NOT NULL,
    reason              NVARCHAR(300)   NULL
);
CREATE INDEX IX_unverified_review_report_id    ON dbo.prohance_unverified_review(report_id);
CREATE INDEX IX_unverified_review_file_number  ON dbo.prohance_unverified_review(file_number);

-- Tab 4: Overall Activity Summary (org-wide)
IF OBJECT_ID('dbo.prohance_overall_activity_summary', 'U') IS NULL
CREATE TABLE dbo.prohance_overall_activity_summary (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    report_id           INT NOT NULL REFERENCES dbo.prohance_reports(id) ON DELETE CASCADE,
    activity_name       NVARCHAR(200)   NULL,
    activity_text       NVARCHAR(MAX)   NULL,
    file_number         NVARCHAR(50)    NULL,
    occurrences         INT             NOT NULL,
    total_duration_sec  FLOAT           NOT NULL,
    users_on_file       INT             NULL,
    file_total_sec      FLOAT           NULL
);
CREATE INDEX IX_overall_activity_report_id   ON dbo.prohance_overall_activity_summary(report_id);
CREATE INDEX IX_overall_activity_file_number ON dbo.prohance_overall_activity_summary(file_number);

-- Tab 5: Overall by User
IF OBJECT_ID('dbo.prohance_overall_by_user', 'U') IS NULL
CREATE TABLE dbo.prohance_overall_by_user (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    report_id           INT NOT NULL REFERENCES dbo.prohance_reports(id) ON DELETE CASCADE,
    user_name           NVARCHAR(200)   NOT NULL,
    activity_name       NVARCHAR(200)   NULL,
    activity_text       NVARCHAR(MAX)   NULL,
    file_number         NVARCHAR(50)    NULL,
    total_duration_sec  FLOAT           NOT NULL,
    users_on_file       INT             NULL,
    file_total_sec      FLOAT           NULL
);
CREATE INDEX IX_overall_by_user_report_id   ON dbo.prohance_overall_by_user(report_id);
CREATE INDEX IX_overall_by_user_user_name   ON dbo.prohance_overall_by_user(user_name);
CREATE INDEX IX_overall_by_user_file_number ON dbo.prohance_overall_by_user(file_number);
