ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "is_ecommerce" boolean DEFAULT false NOT NULL;
