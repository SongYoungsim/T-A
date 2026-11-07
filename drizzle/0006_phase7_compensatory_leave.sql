-- Phase 7: 대체휴무(Compensatory Leave) 관리 컬럼 및 인덱스 보강
-- compensatory_leaves: 원본 휴일근무 취소 및 부여 취소 지원을 위한 cancelled_at, cancelled_by 추가
-- 멱등성 보장

ALTER TABLE `compensatory_leaves` ADD COLUMN `cancelled_at` text;
--> statement-breakpoint
ALTER TABLE `compensatory_leaves` ADD COLUMN `cancelled_by` text REFERENCES `employees`(`id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comp_leave_cancelled` ON `compensatory_leaves` (`cancelled_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comp_leave_source_ot` ON `compensatory_leaves` (`source_overtime_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comp_leave_employee_expires` ON `compensatory_leaves` (`employee_id`, `expires_on`);
--> statement-breakpoint
PRAGMA optimize;
