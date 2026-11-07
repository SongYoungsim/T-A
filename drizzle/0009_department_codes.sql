INSERT INTO `codes` (`group_code`, `code`, `name`, `sort_order`, `is_active`)
VALUES
	('DEPARTMENT', 'T01', '경영지원팀', 1, true),
	('DEPARTMENT', 'T02', '사업개발(덴탈)', 2, true),
	('DEPARTMENT', 'T03', '사업개발(미용)', 3, true),
	('DEPARTMENT', 'T04', '구매(덴탈)', 4, true),
	('DEPARTMENT', 'T05', '구매(미용)', 5, true),
	('DEPARTMENT', 'T06', '생산팀', 6, true),
	('DEPARTMENT', 'T07', '품질경영팀', 7, true),
	('DEPARTMENT', 'T08', '연구소', 8, true),
	('DEPARTMENT', 'T09', 'RA팀', 9, true)
ON CONFLICT (`group_code`, `code`) DO UPDATE SET
	`name` = excluded.`name`,
	`sort_order` = excluded.`sort_order`,
	`is_active` = true,
	`updated_at` = (unixepoch('subsec') * 1000);
--> statement-breakpoint
UPDATE `employees`
SET `department` = '경영지원팀', `updated_at` = datetime('now')
WHERE `department` = '경영지원';
