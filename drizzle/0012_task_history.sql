CREATE TABLE `todo_events` (
	`id` varchar(36) NOT NULL,
	`todo_id` varchar(36) NOT NULL,
	`actor_id` varchar(36),
	`field` varchar(32) NOT NULL,
	`from_value` text,
	`to_value` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `todo_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `todo_events` ADD CONSTRAINT `todo_events_todo_id_todos_id_fk` FOREIGN KEY (`todo_id`) REFERENCES `todos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `todo_events` ADD CONSTRAINT `todo_events_actor_id_user_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `todo_events_todo_idx` ON `todo_events` (`todo_id`,`created_at`);--> statement-breakpoint
-- Existing tasks start their history at creation.
INSERT INTO `todo_events` (`id`, `todo_id`, `actor_id`, `field`, `created_at`)
SELECT UUID(), `id`, `created_by_id`, 'created', `created_at` FROM `todos`;
