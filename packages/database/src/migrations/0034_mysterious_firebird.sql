DO $$ BEGIN
 CREATE TYPE "public"."invoice_type" AS ENUM('individual_item', 'part_of_package');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "schedule_type" ADD VALUE IF NOT EXISTS 'guarantee';--> statement-breakpoint
ALTER TABLE "component_pricing" ADD COLUMN "invoice_type" "invoice_type" DEFAULT 'individual_item' NOT NULL;