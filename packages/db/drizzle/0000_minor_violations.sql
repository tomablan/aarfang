CREATE TYPE "public"."audit_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."cms_type" AS ENUM('wordpress', 'prestashop', 'other');--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('semrush', 'gsc', 'pagespeed', 'betterstack', 'wordpress', 'prestashop');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('active', 'invalid', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."monitor_interval" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'pro', 'agency');--> statement-breakpoint
CREATE TYPE "public"."signal_category" AS ENUM('technique', 'securite', 'seo_technique', 'seo_local', 'opportunites');--> statement-breakpoint
CREATE TYPE "public"."signal_status" AS ENUM('good', 'warning', 'critical', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."site_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TABLE "audit_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"signal_id" varchar(100) NOT NULL,
	"category" "signal_category" NOT NULL,
	"score" integer,
	"status" "signal_status" NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"triggered_by" uuid,
	"status" "audit_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"scores" jsonb,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid,
	"provider" "integration_provider" NOT NULL,
	"credentials" text NOT NULL,
	"status" "integration_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_tested_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"interval" "monitor_interval" DEFAULT 'weekly' NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"alert_on_degradation" boolean DEFAULT true NOT NULL,
	"degradation_threshold" integer DEFAULT 5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"url" varchar(2048) NOT NULL,
	"name" varchar(255) NOT NULL,
	"cms_type" "cms_type",
	"status" "site_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" varchar(100),
	"last_name" varchar(100),
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_results" ADD CONSTRAINT "audit_results_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_results_audit_idx" ON "audit_results" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "audit_results_category_idx" ON "audit_results" USING btree ("category");--> statement-breakpoint
CREATE INDEX "audits_site_idx" ON "audits" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "audits_status_idx" ON "audits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "integrations_org_idx" ON "integrations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "integrations_site_idx" ON "integrations" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monitors_site_idx" ON "monitors" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "sites_org_idx" ON "sites" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("org_id");