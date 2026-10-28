CREATE TABLE `apikey` (
	`id` varchar(36) NOT NULL,
	`config_id` varchar(255) NOT NULL DEFAULT 'default',
	`name` text,
	`start` text,
	`reference_id` varchar(255) NOT NULL,
	`prefix` text,
	`key` varchar(255) NOT NULL,
	`refill_interval` int,
	`refill_amount` int,
	`last_refill_at` timestamp(3),
	`enabled` boolean DEFAULT true,
	`rate_limit_enabled` boolean DEFAULT true,
	`rate_limit_time_window` int DEFAULT 86400000,
	`rate_limit_max` int DEFAULT 10,
	`request_count` int DEFAULT 0,
	`remaining` int,
	`last_request` timestamp(3),
	`expires_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL,
	`updated_at` timestamp(3) NOT NULL,
	`permissions` text,
	`metadata` text,
	CONSTRAINT `apikey_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `todo_events` ADD `source` enum('user','ai') DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `todos` ADD `ai_touched_at` timestamp(3);--> statement-breakpoint
CREATE INDEX `apikey_configId_idx` ON `apikey` (`config_id`);--> statement-breakpoint
CREATE INDEX `apikey_referenceId_idx` ON `apikey` (`reference_id`);--> statement-breakpoint
CREATE INDEX `apikey_key_idx` ON `apikey` (`key`);