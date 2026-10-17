use truedata_qc_db;

-- SQL Server Table Creation DDL
-- Contains table creation queries for both main OPS_QC application and Prohance module

-- ============================================================================
-- MAIN APPLICATION TABLES
-- ============================================================================

-- 1. Users Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
BEGIN
    CREATE TABLE users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
END
ELSE
BEGIN
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'role')
    BEGIN
        ALTER TABLE users ADD role VARCHAR(50) NOT NULL DEFAULT 'user';
    END
    -- Drop the UNIQUE constraint on username if it still exists (usernames are not required to be unique)
    DECLARE @uq_username NVARCHAR(200) = NULL;
    SELECT @uq_username = kc.name
    FROM sys.key_constraints kc
    JOIN sys.index_columns ic ON kc.unique_index_id = ic.index_id AND kc.parent_object_id = ic.object_id
    JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    WHERE OBJECT_NAME(kc.parent_object_id) = 'users' AND kc.type = 'UQ' AND c.name = 'username';
    IF @uq_username IS NOT NULL
        EXEC('ALTER TABLE dbo.users DROP CONSTRAINT [' + @uq_username + ']');
END;

-- 2. Data Dictionary Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='data_dictionary' AND xtype='U')
BEGIN
    CREATE TABLE data_dictionary (
        id                        INT IDENTITY(1,1) PRIMARY KEY,
        field_name                NVARCHAR(MAX) NULL,
        field_label               NVARCHAR(MAX) NULL,
        data_type                 NVARCHAR(MAX) NULL,
        field_enumerations        NVARCHAR(MAX) NULL,
        page_source               NVARCHAR(MAX) NULL,
        actions                   NVARCHAR(MAX) NULL,
        unnamed_0                 NVARCHAR(MAX) NULL,
        allow_tape_map            NVARCHAR(MAX) NULL,
        add_to_guideline_library  NVARCHAR(MAX) NULL,
        true_data                 NVARCHAR(MAX) NULL,
        compare_data              NVARCHAR(MAX) NULL,
        display_type              NVARCHAR(MAX) NULL,
        field_description         NVARCHAR(MAX) NULL,
        custom_field_description  NVARCHAR(MAX) NULL,
        active                    NVARCHAR(MAX) NULL,
        page                      NVARCHAR(MAX) NULL,
        doc_exists                NVARCHAR(MAX) NULL,
        reports                   NVARCHAR(MAX) NULL,
        category                  NVARCHAR(MAX) NULL,
        created_at                DATETIME DEFAULT CURRENT_TIMESTAMP NULL
    );
END;

-- 3. Loan Packages Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='loan_packages' AND xtype='U')
BEGIN
    CREATE TABLE loan_packages (
        id INT IDENTITY(1,1) PRIMARY KEY,
        loan_id NVARCHAR(100) NULL,
        user_id INT NULL FOREIGN KEY REFERENCES users(id) ON DELETE SET NULL,
        filename NVARCHAR(500) NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_fields INT NOT NULL,
        matched INT NOT NULL,
        unmatched INT NOT NULL,
        type_pass INT NOT NULL,
        type_fail INT NOT NULL,
        blank_values INT NOT NULL,
        total_enum INT NOT NULL,
        enum_pass INT NOT NULL,
        enum_format_variance INT NOT NULL,
        enum_fail INT NOT NULL,
        enum_no_list INT NOT NULL,
        numeric_format_flagged INT NOT NULL,
        total_macro INT NOT NULL,
        macro_valid INT NOT NULL,
        macro_invalid INT NOT NULL,
        final_valid INT NOT NULL,
        final_invalid INT NOT NULL,
        final_blank INT NOT NULL
    );
END
ELSE
BEGIN
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('loan_packages') AND name = 'user_id')
    BEGIN
        ALTER TABLE loan_packages ADD user_id INT NULL FOREIGN KEY REFERENCES users(id) ON DELETE SET NULL;
    END
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('loan_packages') AND name = 'loan_id')
    BEGIN
        ALTER TABLE loan_packages ADD loan_id NVARCHAR(100) NULL;
    END
END;

-- 4. Loan Package Records Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='loan_package_records' AND xtype='U')
BEGIN
    CREATE TABLE loan_package_records (
        id INT IDENTITY(1,1) PRIMARY KEY,
        package_id INT NOT NULL FOREIGN KEY REFERENCES loan_packages(id) ON DELETE CASCADE,
        loan_id NVARCHAR(100) NULL,
        data_field NVARCHAR(MAX) NULL,
        data_label NVARCHAR(MAX) NULL,
        true_data NVARCHAR(MAX) NULL,
        dictionary_match_status NVARCHAR(100) NULL,
        data_type_validation NVARCHAR(100) NULL,
        data_type_remarks NVARCHAR(MAX) NULL,
        numeric_format_flag NVARCHAR(100) NULL,
        enum_validation NVARCHAR(100) NULL,
        enum_remarks NVARCHAR(MAX) NULL,
        macro_validation_result NVARCHAR(100) NULL,
        result NVARCHAR(MAX) NULL,
        final_result NVARCHAR(MAX) NULL,
        final_remarks NVARCHAR(MAX) NULL,
        condition_validation NVARCHAR(100) NULL,
        condition_rule_type NVARCHAR(100) NULL,
        condition_remarks NVARCHAR(MAX) NULL,
        action NVARCHAR(100) NULL,
        remark NVARCHAR(MAX) NULL,
        raw_data NVARCHAR(MAX) NULL
    );
END
ELSE
BEGIN
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('loan_package_records') AND name = 'action')
    BEGIN
        ALTER TABLE loan_package_records ADD action NVARCHAR(100) NULL;
    END
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('loan_package_records') AND name = 'remark')
    BEGIN
        ALTER TABLE loan_package_records ADD remark NVARCHAR(MAX) NULL;
    END
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('loan_package_records') AND name = 'raw_data')
    BEGIN
        ALTER TABLE loan_package_records ADD raw_data NVARCHAR(MAX) NULL;
    END
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('loan_package_records') AND name = 'final_result')
    BEGIN
        ALTER TABLE loan_package_records ADD final_result NVARCHAR(MAX) NULL;
    END
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('loan_package_records') AND name = 'final_remarks')
    BEGIN
        ALTER TABLE loan_package_records ADD final_remarks NVARCHAR(MAX) NULL;
    END
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('loan_package_records') AND name = 'condition_validation')
    BEGIN
        ALTER TABLE loan_package_records ADD condition_validation NVARCHAR(100) NULL;
    END
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('loan_package_records') AND name = 'condition_rule_type')
    BEGIN
        ALTER TABLE loan_package_records ADD condition_rule_type NVARCHAR(100) NULL;
    END
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('loan_package_records') AND name = 'condition_remarks')
    BEGIN
        ALTER TABLE loan_package_records ADD condition_remarks NVARCHAR(MAX) NULL;
    END
END;

-- 5. Audit Logs Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='audit_logs' AND xtype='U')
BEGIN
    CREATE TABLE audit_logs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        log_level VARCHAR(20) NOT NULL,
        action VARCHAR(100) NOT NULL,
        username VARCHAR(100) NULL,
        email VARCHAR(255) NULL,
        issue NVARCHAR(MAX) NULL
    );
END;

-- ============================================================================
-- PROHANCE MODULE TABLES
-- ============================================================================

-- 6. Prohance Reports Table
IF OBJECT_ID('dbo.prohance_reports', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.prohance_reports (
        id                  INT IDENTITY(1,1) PRIMARY KEY,
        original_filename   NVARCHAR(500)   NOT NULL,
        raw_file_content    VARBINARY(MAX)  NOT NULL,
        report_period       NVARCHAR(50)    NULL,
        uploaded_at         DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
        processed_at        DATETIME2       NULL,
        status              NVARCHAR(20)    NOT NULL DEFAULT 'PROCESSING',
        error_message       NVARCHAR(MAX)   NULL,
        rows_processed      INT             NULL,
        pdf_rows            INT             NULL,
        lauramac_rows       INT             NULL,
        packages_found      INT             NULL,
        rows_unmapped       INT             NULL,
        rows_unverified     INT             NULL
    );
END;

-- 7. Prohance Package Summary Table
IF OBJECT_ID('dbo.prohance_package_summary', 'U') IS NULL
BEGIN
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
END;

-- 8. Prohance Unmapped Review Table
IF OBJECT_ID('dbo.prohance_unmapped_review', 'U') IS NULL
BEGIN
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
END;

-- 9. Prohance Unverified Review Table
IF OBJECT_ID('dbo.prohance_unverified_review', 'U') IS NULL
BEGIN
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
END;

-- 10. Prohance Overall Activity Summary Table
IF OBJECT_ID('dbo.prohance_overall_activity_summary', 'U') IS NULL
BEGIN
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
END;

-- 11. Prohance Overall By User Table
IF OBJECT_ID('dbo.prohance_overall_by_user', 'U') IS NULL
BEGIN
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
END;

-- 12. User Column Preferences Table
IF OBJECT_ID('dbo.user_column_preferences', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.user_column_preferences (
        id                  INT IDENTITY(1,1) PRIMARY KEY,
        user_id             INT NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
        table_key           VARCHAR(100) NOT NULL,
        selected_columns    NVARCHAR(MAX) NOT NULL,
        updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT UQ_user_column_preferences UNIQUE (user_id, table_key)
    );
    CREATE INDEX IX_user_col_prefs_user_table ON dbo.user_column_preferences(user_id, table_key);
END;

-- 13. System Settings Table (for cluster / multi-worker sync)
IF OBJECT_ID('dbo.system_settings', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.system_settings (
        setting_key         VARCHAR(100) PRIMARY KEY,
        setting_value       NVARCHAR(MAX) NULL,
        updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
    );
END;

