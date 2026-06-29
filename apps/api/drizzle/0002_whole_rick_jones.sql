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
CREATE INDEX `audit_logs_action_idx` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);