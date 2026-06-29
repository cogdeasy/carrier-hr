CREATE TABLE `document_signatures` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`signed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_signatures_doc_emp_idx` ON `document_signatures` (`document_id`,`employee_id`);