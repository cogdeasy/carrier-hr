CREATE TABLE `time_off_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`accrual` integer DEFAULT false NOT NULL,
	`annual_accrual_days` real DEFAULT 0 NOT NULL,
	`max_carryover_days` real DEFAULT 0 NOT NULL,
	`requires_approval` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `time_off_policies_type_unique` ON `time_off_policies` (`type`);--> statement-breakpoint
ALTER TABLE `time_off_requests` ADD `attachment_url` text;