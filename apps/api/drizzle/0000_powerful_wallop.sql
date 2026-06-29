CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`metadata` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `benefit_enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`elected_at` text,
	`dependents` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `benefit_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `benefit_enrollments_uniq` ON `benefit_enrollments` (`employee_id`,`plan_id`);--> statement-breakpoint
CREATE TABLE `benefit_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`carrier` text NOT NULL,
	`description` text NOT NULL,
	`monthly_premium_cents` integer NOT NULL,
	`employer_contribution_cents` integer NOT NULL,
	`coverage_level` text NOT NULL,
	`plan_year` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`stage` text DEFAULT 'applied' NOT NULL,
	`resume_url` text,
	`source` text,
	`rating` integer,
	`notes` text,
	`applied_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `job_requisitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `candidates_job_idx` ON `candidates` (`job_id`);--> statement-breakpoint
CREATE TABLE `company_holidays` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`region` text DEFAULT 'US' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `compensations` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`annual_salary_cents` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`pay_frequency` text DEFAULT 'biweekly' NOT NULL,
	`effective_date` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `course_enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`course_id` text NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`enrolled_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_enrollments_uniq` ON `course_enrollments` (`employee_id`,`course_id`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`provider` text DEFAULT 'Collins Aerospace University' NOT NULL,
	`duration_minutes` integer DEFAULT 30 NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text,
	`name` text NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`url` text NOT NULL,
	`requires_signature` integer DEFAULT false NOT NULL,
	`signed_at` text,
	`uploaded_by_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `documents_employee_idx` ON `documents` (`employee_id`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_number` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text NOT NULL,
	`work_phone` text,
	`personal_phone` text,
	`job_title` text NOT NULL,
	`department` text NOT NULL,
	`division` text DEFAULT 'Collins Aerospace' NOT NULL,
	`location` text NOT NULL,
	`employment_type` text DEFAULT 'full_time' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`manager_id` text,
	`hire_date` text NOT NULL,
	`termination_date` text,
	`date_of_birth` text,
	`gender` text,
	`avatar_url` text,
	`address` text,
	`emergency_contact` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_email_idx` ON `employees` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `employees_number_idx` ON `employees` (`employee_number`);--> statement-breakpoint
CREATE INDEX `employees_manager_idx` ON `employees` (`manager_id`);--> statement-breakpoint
CREATE INDEX `employees_dept_idx` ON `employees` (`department`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`due_date` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `goals_employee_idx` ON `goals` (`employee_id`);--> statement-breakpoint
CREATE TABLE `job_requisitions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`department` text NOT NULL,
	`location` text NOT NULL,
	`employment_type` text DEFAULT 'full_time' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`description` text NOT NULL,
	`hiring_manager_id` text,
	`recruiter_id` text,
	`openings` integer DEFAULT 1 NOT NULL,
	`posted_date` text,
	`salary_min_cents` integer,
	`salary_max_cents` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`hiring_manager_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recruiter_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `job_requisitions_status_idx` ON `job_requisitions` (`status`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`link` text,
	`read` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_employee_idx` ON `notifications` (`employee_id`);--> statement-breakpoint
CREATE TABLE `onboarding_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`category` text DEFAULT 'general' NOT NULL,
	`assignee_role` text DEFAULT 'employee' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`due_date` text,
	`completed_at` text,
	`order_index` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `onboarding_tasks_employee_idx` ON `onboarding_tasks` (`employee_id`);--> statement-breakpoint
CREATE TABLE `one_on_ones` (
	`id` text PRIMARY KEY NOT NULL,
	`manager_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`agenda` text,
	`notes` text,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`manager_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `payslips` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`pay_date` text NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`gross_cents` integer NOT NULL,
	`net_cents` integer NOT NULL,
	`total_deductions_cents` integer NOT NULL,
	`total_tax_cents` integer NOT NULL,
	`lines` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `payslips_employee_idx` ON `payslips` (`employee_id`);--> statement-breakpoint
CREATE TABLE `review_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`self_assessment` text,
	`manager_assessment` text,
	`overall_rating` integer,
	`submitted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `review_cycles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_cycle_employee_idx` ON `reviews` (`cycle_id`,`employee_id`);--> statement-breakpoint
CREATE TABLE `time_off_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`type` text NOT NULL,
	`accrued_days` real DEFAULT 0 NOT NULL,
	`used_days` real DEFAULT 0 NOT NULL,
	`year` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `time_off_balances_uniq` ON `time_off_balances` (`employee_id`,`type`,`year`);--> statement-breakpoint
CREATE TABLE `time_off_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`type` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`total_days` real NOT NULL,
	`reason` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`approver_id` text,
	`decision_note` text,
	`decided_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approver_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `time_off_requests_employee_idx` ON `time_off_requests` (`employee_id`);--> statement-breakpoint
CREATE INDEX `time_off_requests_status_idx` ON `time_off_requests` (`status`);--> statement-breakpoint
CREATE TABLE `timesheet_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`timesheet_id` text NOT NULL,
	`date` text NOT NULL,
	`project` text NOT NULL,
	`hours` real NOT NULL,
	`notes` text,
	FOREIGN KEY (`timesheet_id`) REFERENCES `timesheets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `timesheets` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`week_starting` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`approver_id` text,
	`submitted_at` text,
	`decided_at` text,
	`decision_note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approver_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timesheets_employee_week_idx` ON `timesheets` (`employee_id`,`week_starting`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_roles_user_role_idx` ON `user_roles` (`user_id`,`role`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`last_login_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_employee_idx` ON `users` (`employee_id`);