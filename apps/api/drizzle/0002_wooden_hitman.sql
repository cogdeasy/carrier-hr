CREATE TABLE `onboarding_checklists` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`template_id` text,
	`type` text DEFAULT 'onboarding' NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`anchor_date` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `onboarding_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `onboarding_checklists_employee_idx` ON `onboarding_checklists` (`employee_id`);--> statement-breakpoint
CREATE INDEX `onboarding_checklists_type_idx` ON `onboarding_checklists` (`type`);--> statement-breakpoint
CREATE TABLE `onboarding_template_items` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`category` text DEFAULT 'general' NOT NULL,
	`assignee_role` text DEFAULT 'employee' NOT NULL,
	`due_offset_days` integer DEFAULT 0 NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `onboarding_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `onboarding_template_items_template_idx` ON `onboarding_template_items` (`template_id`);--> statement-breakpoint
CREATE TABLE `onboarding_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'onboarding' NOT NULL,
	`description` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `onboarding_templates_type_idx` ON `onboarding_templates` (`type`);--> statement-breakpoint
ALTER TABLE `onboarding_tasks` ADD `checklist_id` text REFERENCES onboarding_checklists(id);--> statement-breakpoint
CREATE INDEX `onboarding_tasks_checklist_idx` ON `onboarding_tasks` (`checklist_id`);