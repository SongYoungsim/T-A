-- Phase 5: 근무일 캘린더 및 결근 판정 지원
-- 1. work_calendar 테이블 확장 (is_workday, memo, source)
ALTER TABLE `work_calendar` ADD COLUMN `is_workday` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `work_calendar` ADD COLUMN `memo` text;
--> statement-breakpoint
ALTER TABLE `work_calendar` ADD COLUMN `source` text DEFAULT 'MANUAL';
--> statement-breakpoint

-- 2. employees 테이블에 resignation_date 추가 (기존 terminated_on과 병행 호환)
ALTER TABLE `employees` ADD COLUMN `resignation_date` text;
--> statement-breakpoint

-- 3. 인덱스
CREATE INDEX IF NOT EXISTS `idx_work_calendar_date_type` ON `work_calendar` (`calendar_date`, `day_type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_employees_resignation` ON `employees` (`resignation_date`);
--> statement-breakpoint

PRAGMA optimize;
