-- Phase 8: Excel 근태 일괄 업로드 및 Import Batch 추적
-- 멱등성 보장

CREATE TABLE IF NOT EXISTS `attendance_import_batches` (
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_import_batch_actor` ON `attendance_import_batches` (`actor_employee_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_import_batch_created` ON `attendance_import_batches` (`created_at`);
--> statement-breakpoint
ALTER TABLE `attendance` ADD COLUMN `import_batch_id` text REFERENCES `attendance_import_batches`(`id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_attendance_import_batch` ON `attendance` (`import_batch_id`);
--> statement-breakpoint
PRAGMA optimize;
