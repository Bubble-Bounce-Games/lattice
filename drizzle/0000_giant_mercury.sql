CREATE TABLE `knowledge_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`types` text NOT NULL,
	`source_tag` text NOT NULL,
	`source_key` text NOT NULL,
	`summary` text NOT NULL,
	`search_text` text NOT NULL,
	`link` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "entry_title_nonempty" CHECK(length(trim("knowledge_entries"."title")) > 0),
	CONSTRAINT "entry_source_nonempty" CHECK(length(trim("knowledge_entries"."source_tag")) > 0),
	CONSTRAINT "entry_summary_nonempty" CHECK(length(trim("knowledge_entries"."summary")) > 0),
	CONSTRAINT "entry_types_array" CHECK(json_valid("knowledge_entries"."types") AND json_array_length("knowledge_entries"."types") BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX `idx_entries_created_at` ON `knowledge_entries` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_entries_source_created_at` ON `knowledge_entries` (`source_key`,`created_at`);