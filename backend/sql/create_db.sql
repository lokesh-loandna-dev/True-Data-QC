-- SQL Server database creation script
-- Reads database name dynamically from connection / .env in backend runner scripts

IF NOT EXISTS (SELECT database_id FROM sys.databases WHERE name = N'truedata_qc_db')
BEGIN
    CREATE DATABASE [truedata_qc_db];
    PRINT 'Database truedata_qc_db created successfully.';
END
ELSE
BEGIN
    PRINT 'Database truedata_qc_db already exists.';
END
