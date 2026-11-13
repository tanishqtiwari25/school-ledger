CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`created` text NOT NULL,
	`reason` text NOT NULL
);
