CREATE TABLE `annual_leave_masters` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`year` integer NOT NULL,
	`granted_hours` integer DEFAULT 0 NOT NULL,
	`carried_hours` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_annual_leave_employee_year` ON `annual_leave_masters` (`employee_id`,`year`);--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`work_date` text NOT NULL,
	`check_in_at` text,
	`check_out_at` text,
	`source` text DEFAULT 'WEB' NOT NULL,
	`representative_status` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_attendance_employee_date` ON `attendance` (`employee_id`,`work_date`);--> statement-breakpoint
CREATE INDEX `idx_attendance_work_date` ON `attendance` (`work_date`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_target_date` ON `audit_logs` (`target_employee_id`,`target_date`);--> statement-breakpoint
CREATE INDEX `idx_audit_created_at` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_hash_unique` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_account_expiry` ON `auth_sessions` (`account_id`,`expires_at`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE UNIQUE INDEX `compensatory_leave_usages_compensatory_leave_id_unique` ON `compensatory_leave_usages` (`compensatory_leave_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_comp_leave_usage_employee_date` ON `compensatory_leave_usages` (`employee_id`,`used_on`);--> statement-breakpoint
CREATE TABLE `compensatory_leaves` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`source_overtime_id` text NOT NULL,
	`issued_on` text NOT NULL,
	`expires_on` text NOT NULL,
	`status` text DEFAULT 'AVAILABLE' NOT NULL,
	`issued_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_overtime_id`) REFERENCES `overtime_works`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_by`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `compensatory_leaves_source_overtime_id_unique` ON `compensatory_leaves` (`source_overtime_id`);--> statement-breakpoint
CREATE INDEX `idx_comp_leave_employee_status_expiry` ON `compensatory_leaves` (`employee_id`,`status`,`expires_on`);--> statement-breakpoint
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_employee_number_unique` ON `employees` (`employee_number`);--> statement-breakpoint
CREATE INDEX `idx_employees_status_department` ON `employees` (`employment_status`,`department`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX `idx_leave_absence_employee_dates` ON `leave_of_absence_periods` (`employee_id`,`started_on`,`ended_on`);--> statement-breakpoint
CREATE TABLE `leave_usages` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`leave_master_id` text NOT NULL,
	`leave_date` text NOT NULL,
	`leave_type` text NOT NULL,
	`hours` integer NOT NULL,
	`registered_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`leave_master_id`) REFERENCES `annual_leave_masters`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`registered_by`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_leave_usage_employee_date` ON `leave_usages` (`employee_id`,`leave_date`);--> statement-breakpoint
CREATE INDEX `idx_leave_usage_master` ON `leave_usages` (`leave_master_id`);--> statement-breakpoint
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
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_overtime_employee_date` ON `overtime_works` (`employee_id`,`work_date`);--> statement-breakpoint
CREATE INDEX `idx_overtime_work_date_type` ON `overtime_works` (`work_date`,`work_type`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE UNIQUE INDEX `user_accounts_employee_id_unique` ON `user_accounts` (`employee_id`);--> statement-breakpoint
CREATE TABLE `work_calendar` (
	`calendar_date` text PRIMARY KEY NOT NULL,
	`day_type` text NOT NULL,
	`name` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_work_calendar_day_type` ON `work_calendar` (`day_type`);;--> statement-breakpoint
PRAGMA optimize;
