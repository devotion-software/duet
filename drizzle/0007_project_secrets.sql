CREATE TABLE `project_secrets` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`note` varchar(500),
	`value` text NOT NULL,
	`created_by_id` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `project_secrets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `project_secrets` ADD CONSTRAINT `project_secrets_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_secrets` ADD CONSTRAINT `project_secrets_created_by_id_user_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `project_secrets_project_idx` ON `project_secrets` (`project_id`);