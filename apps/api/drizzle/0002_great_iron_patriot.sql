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
ALTER TABLE `course_enrollments` ADD `required` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `course_enrollments` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `course_enrollments` ADD `assigned_by_id` text REFERENCES employees(id);--> statement-breakpoint
ALTER TABLE `course_enrollments` ADD `certificate_serial` text;--> statement-breakpoint
CREATE INDEX `course_enrollments_employee_idx` ON `course_enrollments` (`employee_id`);--> statement-breakpoint
CREATE INDEX `course_enrollments_course_idx` ON `course_enrollments` (`course_id`);