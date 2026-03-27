ALTER TABLE "monitors" ADD COLUMN "alert_email" varchar(255);--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "alert_webhook_url" varchar(2048);