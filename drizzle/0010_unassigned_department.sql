INSERT INTO `codes` (`group_code`, `code`, `name`, `sort_order`, `is_active`)
VALUES ('DEPARTMENT', 'T00', '소속없음', 0, true)
ON CONFLICT (`group_code`, `code`) DO UPDATE SET
	`name` = excluded.`name`,
	`sort_order` = excluded.`sort_order`,
	`is_active` = true,
	`updated_at` = (unixepoch('subsec') * 1000);
