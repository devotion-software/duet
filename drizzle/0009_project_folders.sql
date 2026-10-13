CREATE TABLE `project_folders` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`name` varchar(80) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`collapsed` boolean NOT NULL DEFAULT false,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `project_folders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `project_members` ADD `folder_id` varchar(36);--> statement-breakpoint
ALTER TABLE `project_folders` ADD CONSTRAINT `project_folders_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `project_folders_user_idx` ON `project_folders` (`user_id`);--> statement-breakpoint
ALTER TABLE `project_members` ADD CONSTRAINT `project_members_folder_id_project_folders_id_fk` FOREIGN KEY (`folder_id`) REFERENCES `project_folders`(`id`) ON DELETE set null ON UPDATE no action;