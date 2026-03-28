CREATE TABLE IF NOT EXISTS "webhooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "url" varchar(2048) NOT NULL,
  "events" jsonb NOT NULL DEFAULT '["audit.completed"]',
  "site_id" uuid REFERENCES "sites"("id") ON DELETE CASCADE,
  "secret" varchar(64),
  "enabled" boolean NOT NULL DEFAULT true,
  "last_triggered_at" timestamp,
  "last_status" integer,
  "created_at" timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TYPE "signal_category" ADD VALUE IF NOT EXISTS 'accessibilite';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
