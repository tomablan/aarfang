ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "ai_summary" text;
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "ai_summary_at" timestamp;
