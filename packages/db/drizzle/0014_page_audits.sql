CREATE TABLE "page_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "scores" jsonb,
  "results" jsonb,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);
CREATE INDEX "page_audits_site_idx" ON "page_audits" ("site_id");
