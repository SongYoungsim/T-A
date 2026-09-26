UPDATE `employees`
SET `employment_status` = 'LEAVE', `updated_at` = CURRENT_TIMESTAMP
WHERE `employment_status` = 'ON_LEAVE';
--> statement-breakpoint
UPDATE `employees`
SET `employment_status` = 'RESIGNED', `updated_at` = CURRENT_TIMESTAMP
WHERE `employment_status` = 'TERMINATED';
--> statement-breakpoint
PRAGMA optimize;