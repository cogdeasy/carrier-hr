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
ALTER TABLE `job_requisitions` ADD `division` text;--> statement-breakpoint
ALTER TABLE `job_requisitions` ADD `filled_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `job_requisitions` ADD `closed_at` text;--> statement-breakpoint
ALTER TABLE `job_requisitions` ADD `approved_by_id` text REFERENCES employees(id);--> statement-breakpoint
ALTER TABLE `job_requisitions` ADD `approved_at` text;