-- Phase 4: 출퇴근 근태판정 지원
-- attendance 테이블에 is_late, is_early_leave 세부 플래그 추가
-- representative_status 컬럼은 이미 존재하므로 재사용

-- 1. 지각 플래그 (정수 boolean: 0/1)
ALTER TABLE `attendance` ADD COLUMN `is_late` integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- 2. 조퇴 플래그 (정수 boolean: 0/1)
ALTER TABLE `attendance` ADD COLUMN `is_early_leave` integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- 3. 보정 source 추적: 보정 전 출근시간 보존 (보정 이력 추적용)
ALTER TABLE `attendance` ADD COLUMN `original_check_in_at` text;
--> statement-breakpoint

-- 4. 보정 전 퇴근시간 보존
ALTER TABLE `attendance` ADD COLUMN `original_check_out_at` text;
--> statement-breakpoint

-- 5. 지각/조퇴 빠른 집계를 위한 인덱스
CREATE INDEX IF NOT EXISTS `idx_attendance_status` ON `attendance` (`employee_id`, `representative_status`);
--> statement-breakpoint

-- 6. 월간 조회 최적화: 직원+연월 기반 범위 조회
CREATE INDEX IF NOT EXISTS `idx_attendance_employee_date` ON `attendance` (`employee_id`, `work_date`);
--> statement-breakpoint

PRAGMA optimize;
