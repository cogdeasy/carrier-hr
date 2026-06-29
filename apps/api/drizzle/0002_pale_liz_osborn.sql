CREATE TABLE `one_on_one_action_items` (
	`id` text PRIMARY KEY NOT NULL,
	`one_on_one_id` text NOT NULL,
	`title` text NOT NULL,
	`assignee_id` text,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`one_on_one_id`) REFERENCES `one_on_ones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `one_on_one_action_items_meeting_idx` ON `one_on_one_action_items` (`one_on_one_id`);--> statement-breakpoint
ALTER TABLE `goals` ADD `cycle_id` text REFERENCES review_cycles(id);--> statement-breakpoint
CREATE INDEX `goals_cycle_idx` ON `goals` (`cycle_id`);