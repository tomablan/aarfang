ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "ai_recommendations" text;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "ai_recommendations_at" timestamp;
