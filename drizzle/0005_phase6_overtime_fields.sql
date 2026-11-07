-- Phase 6: 연장근무 및 휴일근무 통합 관리 지원
-- 1. overtime_works 테이블에 grant_comp_leave(대체휴무 1일 부여 옵션), cancelled_at/cancelled_by(취소 이력 보존) 추가
ALTER TABLE `overtime_works` ADD COLUMN `grant_comp_leave` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `overtime_works` ADD COLUMN `cancelled_at` text;
--> statement-breakpoint
ALTER TABLE `overtime_works` ADD COLUMN `cancelled_by` text REFERENCES `employees`(`id`) ON DELETE set null;
--> statement-breakpoint

-- 2. 인덱스 추가
CREATE INDEX IF NOT EXISTS `idx_overtime_cancelled` ON `overtime_works` (`cancelled_at`);
--> statement-breakpoint

PRAGMA optimize;
