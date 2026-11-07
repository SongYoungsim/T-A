-- Phase 3: 연차관리 분(Minutes) 기반 전환 + Soft Delete 지원
-- annual_leave_masters: granted_hours → granted_minutes, carried_hours → carried_minutes
-- leave_usages: hours → minutes, soft delete 컬럼 추가

-- 1. annual_leave_masters에 분 단위 컬럼 추가
ALTER TABLE `annual_leave_masters` ADD COLUMN `granted_minutes` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `annual_leave_masters` ADD COLUMN `carried_minutes` integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- 2. 기존 hours 데이터를 minutes로 변환 (기존 데이터 보존)
UPDATE `annual_leave_masters`
SET `granted_minutes` = `granted_hours` * 60,
    `carried_minutes` = `carried_hours` * 60
WHERE `granted_hours` > 0 OR `carried_hours` > 0;
--> statement-breakpoint

-- 3. leave_usages에 분 단위 컬럼 추가 (hours 컬럼 유지, minutes 추가)
ALTER TABLE `leave_usages` ADD COLUMN `minutes` integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- 4. 기존 leave_usages hours 데이터를 minutes로 변환
UPDATE `leave_usages`
SET `minutes` = `hours` * 60
WHERE `hours` > 0;
--> statement-breakpoint

-- 5. leave_usages Soft Delete 컬럼 추가
ALTER TABLE `leave_usages` ADD COLUMN `cancelled_at` text;
--> statement-breakpoint
ALTER TABLE `leave_usages` ADD COLUMN `cancelled_by` text REFERENCES `employees`(`id`);
--> statement-breakpoint

-- 6. 취소된 연차를 빠르게 필터링하기 위한 인덱스
CREATE INDEX `idx_leave_usage_cancelled` ON `leave_usages` (`cancelled_at`);
--> statement-breakpoint

PRAGMA optimize;
