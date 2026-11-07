CREATE TABLE IF NOT EXISTS `codes` (
	`group_code` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	PRIMARY KEY (`group_code`, `code`)
);
--> statement-breakpoint
INSERT INTO `codes` (`group_code`, `code`, `name`, `sort_order`, `is_active`)
VALUES
	('POSITION', 'P01', '대표', 1, true),
	('POSITION', 'P02', '상무', 2, true),
	('POSITION', 'P03', '이사', 3, true),
	('POSITION', 'P04', '본부장', 4, true),
	('POSITION', 'P05', '부장', 5, true),
	('POSITION', 'P06', '차장', 6, true),
	('POSITION', 'P07', '과장', 7, true),
	('POSITION', 'P08', '대리', 8, true),
	('POSITION', 'P09', '사원', 9, true)
ON CONFLICT (`group_code`, `code`) DO UPDATE SET
	`name` = excluded.`name`,
	`sort_order` = excluded.`sort_order`,
	`is_active` = true,
	`updated_at` = (unixepoch('subsec') * 1000);
