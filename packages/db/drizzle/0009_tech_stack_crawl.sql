ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "tech_stack" jsonb;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "tech_stack_at" timestamp;
ALTER TABLE "audits" ADD COLUMN IF NOT EXISTS "crawl_status" varchar(20);
ALTER TABLE "audits" ADD COLUMN IF NOT EXISTS "crawl_progress" jsonb;
