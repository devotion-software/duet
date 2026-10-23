CREATE TABLE `todo_links` (
	`id` varchar(36) NOT NULL,
	`todo_id` varchar(36) NOT NULL,
	`kind` enum('url','task') NOT NULL,
	`url` varchar(2048),
	`title` varchar(255),
	`linked_todo_id` varchar(36),
	`created_by_id` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `todo_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `todo_links` ADD CONSTRAINT `todo_links_todo_id_todos_id_fk` FOREIGN KEY (`todo_id`) REFERENCES `todos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todo_links` ADD CONSTRAINT `todo_links_linked_todo_id_todos_id_fk` FOREIGN KEY (`linked_todo_id`) REFERENCES `todos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todo_links` ADD CONSTRAINT `todo_links_created_by_id_user_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `todo_links_todo_idx` ON `todo_links` (`todo_id`);--> statement-breakpoint
CREATE INDEX `todo_links_linked_idx` ON `todo_links` (`linked_todo_id`);