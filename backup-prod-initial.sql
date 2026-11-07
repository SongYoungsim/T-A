PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0000_lucky_thor_girl.sql','2026-09-27 09:04:51');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(2,'0001_phase2_status_codes.sql','2026-09-27 09:04:52');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(3,'0002_phase3_leave_minutes.sql','2026-09-27 09:04:52');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(4,'0003_phase4_attendance_flags.sql','2026-09-27 09:04:52');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(5,'0004_phase5_calendar_and_resignation.sql','2026-09-27 09:04:52');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(6,'0005_phase6_overtime_fields.sql','2026-09-27 09:04:52');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(7,'0006_phase7_compensatory_leave.sql','2026-09-27 09:04:52');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(8,'0007_phase8_excel_import.sql','2026-09-27 09:04:53');
CREATE TABLE `annual_leave_masters` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`year` integer NOT NULL,
	`granted_hours` integer DEFAULT 0 NOT NULL,
	`carried_hours` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL, `granted_minutes` integer NOT NULL DEFAULT 0, `carried_minutes` integer NOT NULL DEFAULT 0,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`work_date` text NOT NULL,
	`check_in_at` text,
	`check_out_at` text,
	`source` text DEFAULT 'WEB' NOT NULL,
	`representative_status` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL, `is_late` integer NOT NULL DEFAULT 0, `is_early_leave` integer NOT NULL DEFAULT 0, `original_check_in_at` text, `original_check_out_at` text, `import_batch_id` text REFERENCES `attendance_import_batches`(`id`),
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_employee_id` text,
	`target_employee_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`target_date` text,
	`before_json` text,
	`after_json` text,
	`reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null
);
INSERT INTO "audit_logs" ("id","actor_employee_id","target_employee_id","entity_type","entity_id","action","target_date","before_json","after_json","reason","created_at") VALUES('96712d29-81c8-44ae-a3cf-c2888f93a5b8','983965c3-4be5-4704-b6b6-4693566613ec','983965c3-4be5-4704-b6b6-4693566613ec','USER_ACCOUNT','88c78ece-9d08-47ab-8122-262340641c97','LOGIN',NULL,NULL,NULL,'로그인 성공','2026-09-27T10:15:54.052Z');
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
INSERT INTO "auth_sessions" ("id","account_id","token_hash","expires_at","last_seen_at","created_at") VALUES('a0700c39-09ca-4fc7-8c6e-b4d812198344','88c78ece-9d08-47ab-8122-262340641c97','395f08ad915698c34dba8c08645f54083a4f05fb42985d0bb2c268f71d75bd30','2026-09-27T22:15:53.978Z','2026-09-27T10:15:53.978Z','2026-09-27T10:15:53.978Z');
CREATE TABLE `compensatory_leave_usages` (
	`id` text PRIMARY KEY NOT NULL,
	`compensatory_leave_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`used_on` text NOT NULL,
	`registered_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`compensatory_leave_id`) REFERENCES `compensatory_leaves`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`registered_by`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE TABLE `compensatory_leaves` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`source_overtime_id` text NOT NULL,
	`issued_on` text NOT NULL,
	`expires_on` text NOT NULL,
	`status` text DEFAULT 'AVAILABLE' NOT NULL,
	`issued_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL, `cancelled_at` text, `cancelled_by` text REFERENCES `employees`(`id`),
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_overtime_id`) REFERENCES `overtime_works`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_by`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_number` text NOT NULL,
	`full_name` text NOT NULL,
	`department` text NOT NULL,
	`job_title` text NOT NULL,
	`hired_on` text NOT NULL,
	`employment_status` text DEFAULT 'ACTIVE' NOT NULL,
	`role` text DEFAULT 'USER' NOT NULL,
	`standard_start_minute` integer DEFAULT 540 NOT NULL,
	`standard_end_minute` integer DEFAULT 1080 NOT NULL,
	`terminated_on` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
, `resignation_date` text);
INSERT INTO "employees" ("id","employee_number","full_name","department","job_title","hired_on","employment_status","role","standard_start_minute","standard_end_minute","terminated_on","created_at","updated_at","resignation_date") VALUES('983965c3-4be5-4704-b6b6-4693566613ec','S250101','송영심','경영지원','본부장','2025-01-13','ACTIVE','ADMIN',540,1080,NULL,'2026-09-27T09:46:58.467Z','2026-09-27T09:46:58.467Z',NULL);
CREATE TABLE `leave_of_absence_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`started_on` text NOT NULL,
	`ended_on` text,
	`reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE TABLE `leave_usages` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`leave_master_id` text NOT NULL,
	`leave_date` text NOT NULL,
	`leave_type` text NOT NULL,
	`hours` integer NOT NULL,
	`registered_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL, `minutes` integer NOT NULL DEFAULT 0, `cancelled_at` text, `cancelled_by` text REFERENCES `employees`(`id`),
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`leave_master_id`) REFERENCES `annual_leave_masters`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`registered_by`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE TABLE `overtime_works` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`work_date` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`description` text NOT NULL,
	`work_type` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL, `grant_comp_leave` integer NOT NULL DEFAULT 0, `cancelled_at` text, `cancelled_by` text REFERENCES `employees`(`id`) ON DELETE set null,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE TABLE `user_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_iterations` integer NOT NULL,
	`login_enabled` integer DEFAULT true NOT NULL,
	`last_login_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
INSERT INTO "user_accounts" ("id","employee_id","password_hash","password_salt","password_iterations","login_enabled","last_login_at","created_at","updated_at") VALUES('88c78ece-9d08-47ab-8122-262340641c97','983965c3-4be5-4704-b6b6-4693566613ec','oNwIC9p9dSNqZju+KuFzM5zFTH3UyRF1SzxIkI0EsKo=','aiV83llcWeqh2jqJE1p/Uw==',100000,1,'2026-09-27T10:15:54.052Z','2026-09-27T09:46:58.467Z','2026-09-27T10:15:54.052Z');
CREATE TABLE `work_calendar` (
	`calendar_date` text PRIMARY KEY NOT NULL,
	`day_type` text NOT NULL,
	`name` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL, `is_workday` integer NOT NULL DEFAULT 1, `memo` text, `source` text DEFAULT 'MANUAL',
	FOREIGN KEY (`created_by`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null
);
ANALYZE sqlite_schema;
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('_cf_KV','_cf_KV','1 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('d1_migrations','sqlite_autoindex_d1_migrations_1','1 1');
CREATE TABLE `attendance_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_employee_id` text NOT NULL REFERENCES `employees`(`id`),
	`file_name` text NOT NULL,
	`file_size_bytes` integer DEFAULT 0 NOT NULL,
	`total_rows` integer DEFAULT 0 NOT NULL,
	`new_count` integer DEFAULT 0 NOT NULL,
	`updated_count` integer DEFAULT 0 NOT NULL,
	`same_count` integer DEFAULT 0 NOT NULL,
	`warning_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'COMMITTED' NOT NULL,
	`summary_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('d1_migrations',8);
CREATE UNIQUE INDEX `uq_annual_leave_employee_year` ON `annual_leave_masters` (`employee_id`,`year`);
CREATE UNIQUE INDEX `uq_attendance_employee_date` ON `attendance` (`employee_id`,`work_date`);
CREATE INDEX `idx_attendance_work_date` ON `attendance` (`work_date`);
CREATE INDEX `idx_audit_entity` ON `audit_logs` (`entity_type`,`entity_id`);
CREATE INDEX `idx_audit_target_date` ON `audit_logs` (`target_employee_id`,`target_date`);
CREATE INDEX `idx_audit_created_at` ON `audit_logs` (`created_at`);
CREATE UNIQUE INDEX `auth_sessions_token_hash_unique` ON `auth_sessions` (`token_hash`);
CREATE INDEX `idx_auth_sessions_account_expiry` ON `auth_sessions` (`account_id`,`expires_at`);
CREATE UNIQUE INDEX `compensatory_leave_usages_compensatory_leave_id_unique` ON `compensatory_leave_usages` (`compensatory_leave_id`);
CREATE UNIQUE INDEX `uq_comp_leave_usage_employee_date` ON `compensatory_leave_usages` (`employee_id`,`used_on`);
CREATE UNIQUE INDEX `compensatory_leaves_source_overtime_id_unique` ON `compensatory_leaves` (`source_overtime_id`);
CREATE INDEX `idx_comp_leave_employee_status_expiry` ON `compensatory_leaves` (`employee_id`,`status`,`expires_on`);
CREATE UNIQUE INDEX `employees_employee_number_unique` ON `employees` (`employee_number`);
CREATE INDEX `idx_employees_status_department` ON `employees` (`employment_status`,`department`);
CREATE INDEX `idx_leave_absence_employee_dates` ON `leave_of_absence_periods` (`employee_id`,`started_on`,`ended_on`);
CREATE UNIQUE INDEX `uq_leave_usage_employee_date` ON `leave_usages` (`employee_id`,`leave_date`);
CREATE INDEX `idx_leave_usage_master` ON `leave_usages` (`leave_master_id`);
CREATE INDEX `idx_overtime_employee_date` ON `overtime_works` (`employee_id`,`work_date`);
CREATE INDEX `idx_overtime_work_date_type` ON `overtime_works` (`work_date`,`work_type`);
CREATE UNIQUE INDEX `user_accounts_employee_id_unique` ON `user_accounts` (`employee_id`);
CREATE INDEX `idx_work_calendar_day_type` ON `work_calendar` (`day_type`);
CREATE INDEX `idx_leave_usage_cancelled` ON `leave_usages` (`cancelled_at`);
CREATE INDEX `idx_attendance_status` ON `attendance` (`employee_id`, `representative_status`);
CREATE INDEX `idx_attendance_employee_date` ON `attendance` (`employee_id`, `work_date`);
CREATE INDEX `idx_work_calendar_date_type` ON `work_calendar` (`calendar_date`, `day_type`);
CREATE INDEX `idx_employees_resignation` ON `employees` (`resignation_date`);
CREATE INDEX `idx_overtime_cancelled` ON `overtime_works` (`cancelled_at`);
CREATE INDEX `idx_comp_leave_cancelled` ON `compensatory_leaves` (`cancelled_at`);
CREATE INDEX `idx_comp_leave_source_ot` ON `compensatory_leaves` (`source_overtime_id`);
CREATE INDEX `idx_comp_leave_employee_expires` ON `compensatory_leaves` (`employee_id`, `expires_on`);
CREATE INDEX `idx_import_batch_actor` ON `attendance_import_batches` (`actor_employee_id`);
CREATE INDEX `idx_import_batch_created` ON `attendance_import_batches` (`created_at`);
CREATE INDEX `idx_attendance_import_batch` ON `attendance` (`import_batch_id`);
