CREATE TABLE `benefit_dependents` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`relationship` text NOT NULL,
	`date_of_birth` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `benefit_dependents_employee_idx` ON `benefit_dependents` (`employee_id`);--> statement-breakpoint
CREATE TABLE `benefit_plan_tiers` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`tier` text NOT NULL,
	`monthly_premium_cents` integer NOT NULL,
	`employer_contribution_cents` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `benefit_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `benefit_plan_tiers_uniq` ON `benefit_plan_tiers` (`plan_id`,`tier`);--> statement-breakpoint
CREATE TABLE `enrollment_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`plan_year` integer NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `qualifying_life_events` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`type` text NOT NULL,
	`event_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`window_ends_at` text NOT NULL,
	`note` text,
	`decided_by_id` text,
	`decided_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `qle_employee_idx` ON `qualifying_life_events` (`employee_id`);--> statement-breakpoint
ALTER TABLE `benefit_enrollments` ADD `coverage_tier` text DEFAULT 'employee_only' NOT NULL;--> statement-breakpoint
ALTER TABLE `benefit_enrollments` ADD `effective_date` text;--> statement-breakpoint
ALTER TABLE `benefit_enrollments` ADD `end_date` text;--> statement-breakpoint
ALTER TABLE `benefit_enrollments` ADD `qle_id` text REFERENCES qualifying_life_events(id);--> statement-breakpoint
ALTER TABLE `benefit_enrollments` ADD `dependent_ids` text DEFAULT '[]' NOT NULL;