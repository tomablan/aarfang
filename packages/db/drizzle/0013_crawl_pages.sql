CREATE TABLE "crawl_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "audit_id" uuid NOT NULL REFERENCES "audits"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "status_code" integer NOT NULL,
  "title" text,
  "indexable" boolean NOT NULL DEFAULT true,
  "crawl_depth" integer NOT NULL DEFAULT 0,
  "inlinks" integer NOT NULL DEFAULT 0,
  "word_count" integer,
  "content_type" varchar(100)
);

CREATE INDEX "crawl_pages_audit_idx" ON "crawl_pages" ("audit_id");
