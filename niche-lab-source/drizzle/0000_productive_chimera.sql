CREATE TABLE `etsy_request_budget` (
	`day` text PRIMARY KEY NOT NULL,
	`requests` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `etsy_rate_gate` (
	`id` integer PRIMARY KEY NOT NULL,
	`next_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `keywords` (
	`keyword` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `collector_lease` (
	`id` integer PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tracked_listings` (
	`listing_id` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`watched` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `keyword_listings` (
	`keyword` text NOT NULL,
	`listing_id` integer NOT NULL,
	PRIMARY KEY(`keyword`, `listing_id`),
	FOREIGN KEY (`keyword`) REFERENCES `keywords`(`keyword`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listing_id`) REFERENCES `tracked_listings`(`listing_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `collection_runs` (
	`day` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tracker_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_snapshots` (
	`listing_id` integer NOT NULL,
	`day` text NOT NULL,
	`observed_at` text NOT NULL,
	`favorites` integer,
	`quantity` integer,
	`views` integer,
	`shop_sales` integer,
	PRIMARY KEY(`listing_id`, `day`),
	FOREIGN KEY (`listing_id`) REFERENCES `tracked_listings`(`listing_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `snapshots_day_idx` ON `daily_snapshots` (`day`);--> statement-breakpoint
CREATE TABLE `collection_tasks` (
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`item_key` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	PRIMARY KEY(`day`, `kind`, `item_key`),
	FOREIGN KEY (`day`) REFERENCES `collection_runs`(`day`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_pending_idx` ON `collection_tasks` (`day`,`state`,`kind`);