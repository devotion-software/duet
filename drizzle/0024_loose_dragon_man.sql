CREATE TABLE `saved_views` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`name` varchar(80) NOT NULL,
	`config` text NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `saved_views_id` PRIMARY KEY(`id`),
	CONSTRAINT `saved_views_unique` UNIQUE(`project_id`,`user_id`,`name`)
);
--> statement-breakpoint
ALTER TABLE `saved_views` ADD CONSTRAINT `saved_views_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `saved_views` ADD CONSTRAINT `saved_views_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `saved_views_project_user_idx` ON `saved_views` (`project_id`,`user_id`);