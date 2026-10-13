ALTER TABLE `projects` ADD `status` enum('not_started','in_progress','live','archived') DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
UPDATE `projects` SET `status` = IF(`archived`, 'archived', 'in_progress');--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `archived`;