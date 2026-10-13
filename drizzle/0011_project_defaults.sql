ALTER TABLE `projects` MODIFY COLUMN `list_width` int;--> statement-breakpoint
ALTER TABLE `projects` MODIFY COLUMN `count_subtasks` boolean;--> statement-breakpoint
ALTER TABLE `user` ADD `default_list_width` int DEFAULT 820 NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `default_count_subtasks` boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Projects still on the old built-in values follow the account default, which starts out the same.
UPDATE `projects` SET `list_width` = NULL WHERE `list_width` = 820;--> statement-breakpoint
UPDATE `projects` SET `count_subtasks` = NULL WHERE `count_subtasks` = true;
