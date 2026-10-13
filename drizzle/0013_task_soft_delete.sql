ALTER TABLE `todos` ADD `deleted_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `todos` ADD `deleted_by_id` varchar(36);--> statement-breakpoint
ALTER TABLE `todos` ADD CONSTRAINT `todos_deleted_by_id_user_id_fk` FOREIGN KEY (`deleted_by_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `todos_project_deleted_idx` ON `todos` (`project_id`,`deleted_at`);