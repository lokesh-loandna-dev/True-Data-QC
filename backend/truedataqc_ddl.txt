-- DROP SCHEMA dbo;

CREATE SCHEMA dbo;
-- ldprodazsqldbsrv02.dbo.audit_logs definition

-- Drop table

-- DROP TABLE ldprodazsqldbsrv02.dbo.audit_logs;

CREATE TABLE ldprodazsqldbsrv02.dbo.audit_logs (
	id int IDENTITY(1,1) NOT NULL,
	[timestamp] datetime DEFAULT getdate() NULL,
	log_level varchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[action] varchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	username varchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	email varchar(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	issue nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	CONSTRAINT PK__audit_lo__3213E83F1C7A435D PRIMARY KEY (id)
);


-- ldprodazsqldbsrv02.dbo.data_dictionary definition

-- Drop table

-- DROP TABLE ldprodazsqldbsrv02.dbo.data_dictionary;

CREATE TABLE ldprodazsqldbsrv02.dbo.data_dictionary (
	id int IDENTITY(1,1) NOT NULL,
	field_name nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	field_label nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	data_type nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	field_enumerations nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	page_source nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	actions nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	unnamed_0 nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	allow_tape_map nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	add_to_guideline_library nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	true_data nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	compare_data nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	display_type nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	field_description nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	custom_field_description nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	active nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	page nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	doc_exists nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	reports nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	category nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	created_at datetime DEFAULT getdate() NULL,
	CONSTRAINT PK__data_dic__3213E83FF45B12A9 PRIMARY KEY (id)
);


-- ldprodazsqldbsrv02.dbo.prohance_reports definition

-- Drop table

-- DROP TABLE ldprodazsqldbsrv02.dbo.prohance_reports;

CREATE TABLE ldprodazsqldbsrv02.dbo.prohance_reports (
	id int IDENTITY(1,1) NOT NULL,
	original_filename nvarchar(500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	raw_file_content varbinary(MAX) NOT NULL,
	report_period nvarchar(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	uploaded_at datetime2 DEFAULT sysutcdatetime() NOT NULL,
	processed_at datetime2 NULL,
	status nvarchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS DEFAULT 'PROCESSING' NOT NULL,
	error_message nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	rows_processed int NULL,
	pdf_rows int NULL,
	lauramac_rows int NULL,
	packages_found int NULL,
	rows_unmapped int NULL,
	rows_unverified int NULL,
	CONSTRAINT PK__prohance__3213E83F43E1ECD2 PRIMARY KEY (id)
);


-- ldprodazsqldbsrv02.dbo.system_settings definition

-- Drop table

-- DROP TABLE ldprodazsqldbsrv02.dbo.system_settings;

CREATE TABLE ldprodazsqldbsrv02.dbo.system_settings (
	setting_key varchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	setting_value nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	updated_at datetime DEFAULT getdate() NULL,
	CONSTRAINT PK__system_s__0DFAC4262DAF04E3 PRIMARY KEY (setting_key)
);


-- ldprodazsqldbsrv02.dbo.users definition

-- Drop table

-- DROP TABLE ldprodazsqldbsrv02.dbo.users;

CREATE TABLE ldprodazsqldbsrv02.dbo.users (
	id int IDENTITY(1,1) NOT NULL,
	username varchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	email varchar(255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	password_hash varchar(255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[role] varchar(50) COLLATE SQL_Latin1_General_CP1_CI_AS DEFAULT 'user' NOT NULL,
	created_at datetime DEFAULT getdate() NULL,
	CONSTRAINT PK__users__3213E83FF411DE64 PRIMARY KEY (id),
	CONSTRAINT UQ__users__AB6E61646F2405A6 UNIQUE (email),
	CONSTRAINT UQ__users__F3DBC572845ED206 UNIQUE (username)
);


-- ldprodazsqldbsrv02.dbo.loan_packages definition

-- Drop table

-- DROP TABLE ldprodazsqldbsrv02.dbo.loan_packages;

CREATE TABLE ldprodazsqldbsrv02.dbo.loan_packages (
	id int IDENTITY(1,1) NOT NULL,
	loan_id nvarchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	user_id int NULL,
	filename nvarchar(500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	uploaded_at datetime DEFAULT getdate() NULL,
	total_fields int NOT NULL,
	[matched] int NOT NULL,
	unmatched int NOT NULL,
	type_pass int NOT NULL,
	type_fail int NOT NULL,
	blank_values int NOT NULL,
	total_enum int NOT NULL,
	enum_pass int NOT NULL,
	enum_format_variance int NOT NULL,
	enum_fail int NOT NULL,
	enum_no_list int NOT NULL,
	numeric_format_flagged int NOT NULL,
	total_macro int NOT NULL,
	macro_valid int NOT NULL,
	macro_invalid int NOT NULL,
	final_valid int NOT NULL,
	final_invalid int NOT NULL,
	final_blank int NOT NULL,
	CONSTRAINT PK__loan_pac__3213E83FBFE107AC PRIMARY KEY (id),
	CONSTRAINT FK__loan_pack__user___787EE5A0 FOREIGN KEY (user_id) REFERENCES ldprodazsqldbsrv02.dbo.users(id) ON DELETE SET NULL
);


-- ldprodazsqldbsrv02.dbo.prohance_overall_activity_summary definition

-- Drop table

-- DROP TABLE ldprodazsqldbsrv02.dbo.prohance_overall_activity_summary;

CREATE TABLE ldprodazsqldbsrv02.dbo.prohance_overall_activity_summary (
	id int IDENTITY(1,1) NOT NULL,
	report_id int NOT NULL,
	activity_name nvarchar(200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	activity_text nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	file_number nvarchar(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	occurrences int NOT NULL,
	total_duration_sec float NOT NULL,
	users_on_file int NULL,
	file_total_sec float NULL,
	CONSTRAINT PK__prohance__3213E83F1DAC3741 PRIMARY KEY (id),
	CONSTRAINT FK__prohance___repor__0E6E26BF FOREIGN KEY (report_id) REFERENCES ldprodazsqldbsrv02.dbo.prohance_reports(id) ON DELETE CASCADE
);
 CREATE NONCLUSTERED INDEX IX_overall_activity_file_number ON ldprodazsqldbsrv02.dbo.prohance_overall_activity_summary (  file_number ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 100  ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_overall_activity_report_id ON ldprodazsqldbsrv02.dbo.prohance_overall_activity_summary (  report_id ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 100  ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- ldprodazsqldbsrv02.dbo.prohance_overall_by_user definition

-- Drop table

-- DROP TABLE ldprodazsqldbsrv02.dbo.prohance_overall_by_user;

CREATE TABLE ldprodazsqldbsrv02.dbo.prohance_overall_by_user (
	id int IDENTITY(1,1) NOT NULL,
	report_id int NOT NULL,
	user_name nvarchar(200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	activity_name nvarchar(200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	activity_text nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	file_number nvarchar(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	total_duration_sec float NOT NULL,
	users_on_file int NULL,
	file_total_sec float NULL,
	CONSTRAINT PK__prohance__3213E83F4E53261A PRIMARY KEY (id),
	CONSTRAINT FK__prohance___repor__114A936A FOREIGN KEY (report_id) REFERENCES ldprodazsqldbsrv02.dbo.prohance_reports(id) ON DELETE CASCADE
);
 CREATE NONCLUSTERED INDEX IX_overall_by_user_file_number ON ldprodazsqldbsrv02.dbo.prohance_overall_by_user (  file_number ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 100  ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_overall_by_user_report_id ON ldprodazsqldbsrv02.dbo.prohance_overall_by_user (  report_id ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 100  ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_overall_by_user_user_name ON ldprodazsqldbsrv02.dbo.prohance_overall_by_user (  user_name ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 100  ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- ldprodazsqldbsrv02.dbo.prohance_package_summary definition

-- Drop table

-- DROP TABLE ldprodazsqldbsrv02.dbo.prohance_package_summary;

CREATE TABLE ldprodazsqldbsrv02.dbo.prohance_package_summary (
	id int IDENTITY(1,1) NOT NULL,
	report_id int NOT NULL,
	file_number nvarchar(50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	user_name nvarchar(200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	session_date nvarchar(50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	pdf_time_sec float NOT NULL,
	lauramac_time_sec float NOT NULL,
	total_time_sec float NOT NULL,
	users_on_file int NOT NULL,
	file_total_sec float NOT NULL,
	CONSTRAINT PK__prohance__3213E83F0E64E247 PRIMARY KEY (id),
	CONSTRAINT FK__prohance___repor__05D8E0BE FOREIGN KEY (report_id) REFERENCES ldprodazsqldbsrv02.dbo.prohance_reports(id) ON DELETE CASCADE
);
 CREATE NONCLUSTERED INDEX IX_package_summary_file_number ON ldprodazsqldbsrv02.dbo.prohance_package_summary (  file_number ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 100  ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_package_summary_report_id ON ldprodazsqldbsrv02.dbo.prohance_package_summary (  report_id ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 100  ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- ldprodazsqldbsrv02.dbo.prohance_unmapped_review definition

-- Drop table

-- DROP TABLE ldprodazsqldbsrv02.dbo.prohance_unmapped_review;

CREATE TABLE ldprodazsqldbsrv02.dbo.prohance_unmapped_review (
	id int IDENTITY(1,1) NOT NULL,
	report_id int NOT NULL,
	user_name nvarchar(200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	session_date nvarchar(50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	row_type nvarchar(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	category_name nvarchar(200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	activity_name nvarchar(200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	activity_text nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	process_name nvarchar(200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	start_time nvarchar(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	end_time nvarchar(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	duration_sec float NOT NULL,
	reason nvarchar(200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	CONSTRAINT PK__prohance__3213E83FD06D5CA1 PRIMARY KEY (id),
	CONSTRAINT FK__prohance___repor__08B54D69 FOREIGN KEY (report_id) REFERENCES ldprodazsqldbsrv02.dbo.prohance_reports(id) ON DELETE CASCADE
);
 CREATE NONCLUSTERED INDEX IX_unmapped_review_report_id ON ldprodazsqldbsrv02.dbo.prohance_unmapped_review (  report_id ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 100  ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- ldprodazsqldbsrv02.dbo.prohance_unverified_review definition

-- Drop table

-- DROP TABLE ldprodazsqldbsrv02.dbo.prohance_unverified_review;

CREATE TABLE ldprodazsqldbsrv02.dbo.prohance_unverified_review (
	id int IDENTITY(1,1) NOT NULL,
	report_id int NOT NULL,
	user_name nvarchar(200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	session_date nvarchar(50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	file_number nvarchar(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	activity_text nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	start_time nvarchar(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	end_time nvarchar(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	duration_sec float NOT NULL,
	reason nvarchar(300) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	CONSTRAINT PK__prohance__3213E83FECFE0ECA PRIMARY KEY (id),
	CONSTRAINT FK__prohance___repor__0B91BA14 FOREIGN KEY (report_id) REFERENCES ldprodazsqldbsrv02.dbo.prohance_reports(id) ON DELETE CASCADE
);
 CREATE NONCLUSTERED INDEX IX_unverified_review_file_number ON ldprodazsqldbsrv02.dbo.prohance_unverified_review (  file_number ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 100  ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;
 CREATE NONCLUSTERED INDEX IX_unverified_review_report_id ON ldprodazsqldbsrv02.dbo.prohance_unverified_review (  report_id ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 100  ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- ldprodazsqldbsrv02.dbo.user_column_preferences definition

-- Drop table

-- DROP TABLE ldprodazsqldbsrv02.dbo.user_column_preferences;

CREATE TABLE ldprodazsqldbsrv02.dbo.user_column_preferences (
	id int IDENTITY(1,1) NOT NULL,
	user_id int NOT NULL,
	table_key varchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	selected_columns nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	updated_at datetime DEFAULT getdate() NULL,
	CONSTRAINT PK__user_col__3213E83F54E9B423 PRIMARY KEY (id),
	CONSTRAINT UQ_user_column_preferences UNIQUE (user_id,table_key),
	CONSTRAINT FK__user_colu__user___2EDAF651 FOREIGN KEY (user_id) REFERENCES ldprodazsqldbsrv02.dbo.users(id) ON DELETE CASCADE
);
 CREATE NONCLUSTERED INDEX IX_user_col_prefs_user_table ON ldprodazsqldbsrv02.dbo.user_column_preferences (  user_id ASC  , table_key ASC  )  
	 WITH (  PAD_INDEX = OFF ,FILLFACTOR = 100  ,SORT_IN_TEMPDB = OFF , IGNORE_DUP_KEY = OFF , STATISTICS_NORECOMPUTE = OFF , ONLINE = OFF , ALLOW_ROW_LOCKS = ON , ALLOW_PAGE_LOCKS = ON  )
	 ON [PRIMARY ] ;


-- ldprodazsqldbsrv02.dbo.loan_package_records definition

-- Drop table

-- DROP TABLE ldprodazsqldbsrv02.dbo.loan_package_records;

CREATE TABLE ldprodazsqldbsrv02.dbo.loan_package_records (
	id int IDENTITY(1,1) NOT NULL,
	package_id int NOT NULL,
	loan_id nvarchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	data_field nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	data_label nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	true_data nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	dictionary_match_status nvarchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	data_type_validation nvarchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	data_type_remarks nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	numeric_format_flag nvarchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	enum_validation nvarchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	enum_remarks nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	macro_validation_result nvarchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[result] nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	final_result nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	final_remarks nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	condition_validation nvarchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	condition_rule_type nvarchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	condition_remarks nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	[action] nvarchar(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	remark nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	raw_data nvarchar(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
	CONSTRAINT PK__loan_pac__3213E83F070A6DA1 PRIMARY KEY (id),
	CONSTRAINT FK__loan_pack__packa__7C4F7684 FOREIGN KEY (package_id) REFERENCES ldprodazsqldbsrv02.dbo.loan_packages(id) ON DELETE CASCADE
);