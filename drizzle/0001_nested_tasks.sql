ALTER TABLE `todos` ADD `parent_id` varchar(36);--> statement-breakpoint
ALTER TABLE `todos` ADD CONSTRAINT `todos_parent_id_todos_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `todos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `todos_parent_idx` ON `todos` (`parent_id`);