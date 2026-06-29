CREATE TABLE `pay_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`pay_date` text NOT NULL,
	`frequency` text DEFAULT 'biweekly' NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`created_by_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `payslips` ADD `frequency` text DEFAULT 'biweekly' NOT NULL;--> statement-breakpoint
ALTER TABLE `payslips` ADD `total_contributions_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payslips` ADD `pay_run_id` text REFERENCES pay_runs(id);--> statement-breakpoint
CREATE INDEX `payslips_pay_run_idx` ON `payslips` (`pay_run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payslips_employee_period_idx` ON `payslips` (`employee_id`,`period_start`,`period_end`);