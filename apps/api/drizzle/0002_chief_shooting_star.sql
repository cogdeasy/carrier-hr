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
CREATE TABLE `candidate_stage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`from_stage` text,
	`to_stage` text NOT NULL,
	`note` text,
	`changed_by_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `candidate_stage_events_candidate_idx` ON `candidate_stage_events` (`candidate_id`);--> statement-breakpoint
CREATE TABLE `course_prerequisites` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`prerequisite_id` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prerequisite_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_prerequisites_uniq` ON `course_prerequisites` (`course_id`,`prerequisite_id`);--> statement-breakpoint
CREATE INDEX `course_prerequisites_course_idx` ON `course_prerequisites` (`course_id`);--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`url` text NOT NULL,
	`note` text,
	`uploaded_by_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `document_versions_document_idx` ON `document_versions` (`document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_versions_doc_version_idx` ON `document_versions` (`document_id`,`version`);--> statement-breakpoint
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
CREATE TABLE `interview_scorecards` (
	`id` text PRIMARY KEY NOT NULL,
	`interview_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`interviewer_id` text NOT NULL,
	`rating` integer NOT NULL,
	`recommendation` text NOT NULL,
	`strengths` text,
	`concerns` text,
	`comments` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`interview_id`) REFERENCES `interviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`interviewer_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_scorecards_interview_idx` ON `interview_scorecards` (`interview_id`);--> statement-breakpoint
CREATE INDEX `interview_scorecards_candidate_idx` ON `interview_scorecards` (`candidate_id`);--> statement-breakpoint
CREATE TABLE `interviews` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`job_id` text NOT NULL,
	`interviewer_id` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`duration_minutes` integer DEFAULT 60 NOT NULL,
	`mode` text DEFAULT 'video' NOT NULL,
	`stage` text DEFAULT 'interview' NOT NULL,
	`location` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `job_requisitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`interviewer_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `interviews_candidate_idx` ON `interviews` (`candidate_id`);--> statement-breakpoint
CREATE INDEX `interviews_interviewer_idx` ON `interviews` (`interviewer_id`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`type` text NOT NULL,
	`muted` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_preferences_employee_type_idx` ON `notification_preferences` (`employee_id`,`type`);--> statement-breakpoint
CREATE TABLE `offers` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`job_id` text NOT NULL,
	`salary_cents` integer NOT NULL,
	`start_date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`expires_at` text,
	`notes` text,
	`extended_by_id` text,
	`decided_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `job_requisitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`extended_by_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `offers_candidate_idx` ON `offers` (`candidate_id`);--> statement-breakpoint
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
CREATE TABLE `org_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`legal_name` text DEFAULT 'Collins Aerospace' NOT NULL,
	`display_name` text DEFAULT 'Collins Aerospace' NOT NULL,
	`parent_company` text DEFAULT 'RTX' NOT NULL,
	`headquarters` text DEFAULT 'Charlotte, NC' NOT NULL,
	`support_email` text DEFAULT 'hr@collins.com' NOT NULL,
	`phone` text,
	`website` text DEFAULT 'https://www.collinsaerospace.com' NOT NULL,
	`timezone` text DEFAULT 'America/New_York' NOT NULL,
	`fiscal_year_start_month` integer DEFAULT 1 NOT NULL,
	`divisions` text DEFAULT '[]' NOT NULL,
	`locations` text DEFAULT '[]' NOT NULL,
	`departments` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE `signature_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`requested_by_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`message` text,
	`due_date` text,
	`signed_at` text,
	`declined_at` text,
	`decline_reason` text,
	`reminders_sent` integer DEFAULT 0 NOT NULL,
	`last_reminder_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `signature_requests_document_idx` ON `signature_requests` (`document_id`);--> statement-breakpoint
CREATE INDEX `signature_requests_employee_idx` ON `signature_requests` (`employee_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `signature_requests_doc_emp_idx` ON `signature_requests` (`document_id`,`employee_id`);--> statement-breakpoint
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
ALTER TABLE `benefit_enrollments` ADD `coverage_tier` text DEFAULT 'employee_only' NOT NULL;--> statement-breakpoint
ALTER TABLE `benefit_enrollments` ADD `effective_date` text;--> statement-breakpoint
ALTER TABLE `benefit_enrollments` ADD `end_date` text;--> statement-breakpoint
ALTER TABLE `benefit_enrollments` ADD `qle_id` text REFERENCES qualifying_life_events(id);--> statement-breakpoint
ALTER TABLE `benefit_enrollments` ADD `dependent_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `course_enrollments` ADD `required` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `course_enrollments` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `course_enrollments` ADD `assigned_by_id` text REFERENCES employees(id);--> statement-breakpoint
ALTER TABLE `course_enrollments` ADD `certificate_serial` text;--> statement-breakpoint
CREATE INDEX `course_enrollments_employee_idx` ON `course_enrollments` (`employee_id`);--> statement-breakpoint
CREATE INDEX `course_enrollments_course_idx` ON `course_enrollments` (`course_id`);--> statement-breakpoint
ALTER TABLE `documents` ADD `description` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL;--> statement-breakpoint
CREATE INDEX `documents_category_idx` ON `documents` (`category`);--> statement-breakpoint
CREATE INDEX `documents_status_idx` ON `documents` (`status`);--> statement-breakpoint
ALTER TABLE `goals` ADD `cycle_id` text REFERENCES review_cycles(id);--> statement-breakpoint
CREATE INDEX `goals_cycle_idx` ON `goals` (`cycle_id`);--> statement-breakpoint
ALTER TABLE `job_requisitions` ADD `division` text;--> statement-breakpoint
ALTER TABLE `job_requisitions` ADD `filled_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `job_requisitions` ADD `closed_at` text;--> statement-breakpoint
ALTER TABLE `job_requisitions` ADD `approved_by_id` text REFERENCES employees(id);--> statement-breakpoint
ALTER TABLE `job_requisitions` ADD `approved_at` text;--> statement-breakpoint
ALTER TABLE `onboarding_tasks` ADD `checklist_id` text REFERENCES onboarding_checklists(id);--> statement-breakpoint
CREATE INDEX `onboarding_tasks_checklist_idx` ON `onboarding_tasks` (`checklist_id`);--> statement-breakpoint
ALTER TABLE `payslips` ADD `frequency` text DEFAULT 'biweekly' NOT NULL;--> statement-breakpoint
ALTER TABLE `payslips` ADD `total_contributions_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payslips` ADD `pay_run_id` text REFERENCES pay_runs(id);--> statement-breakpoint
CREATE INDEX `payslips_pay_run_idx` ON `payslips` (`pay_run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payslips_employee_period_idx` ON `payslips` (`employee_id`,`period_start`,`period_end`);--> statement-breakpoint
ALTER TABLE `time_off_requests` ADD `attachment_url` text;--> statement-breakpoint
ALTER TABLE `timesheet_entries` ADD `task` text;--> statement-breakpoint
CREATE INDEX `audit_logs_action_idx` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);