ALTER TABLE `projects` MODIFY COLUMN `color` varchar(64) NOT NULL DEFAULT '#6366f1';--> statement-breakpoint
ALTER TABLE `projects` ADD `accent_gradient` varchar(255);