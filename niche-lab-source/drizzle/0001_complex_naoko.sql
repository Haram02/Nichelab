CREATE TABLE `shop_daily_snapshots` (
	`shop_id` integer NOT NULL,
	`day` text NOT NULL,
	`observed_at` text NOT NULL,
	`favorites` integer,
	`shop_sales` integer,
	`active_listings` integer,
	`review_count` integer,
	PRIMARY KEY(`shop_id`, `day`),
	FOREIGN KEY (`shop_id`) REFERENCES `tracked_shops`(`shop_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tracked_shops` (
	`shop_id` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_error` text
);
