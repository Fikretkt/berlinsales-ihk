CREATE TYPE "public"."action_result" AS ENUM('success', 'escalation', 'declined', 'no_contact', 'ok', 'problem');--> statement-breakpoint
CREATE TYPE "public"."action_type" AS ENUM('visit', 'profi_visit', 'delivery', 'control', 'cancel_order', 'manual_override');--> statement-breakpoint
CREATE TYPE "public"."market_status" AS ENUM('gruen', 'blau', 'gelb', 'orange', 'rosa', 'rot', 'grau');--> statement-breakpoint
CREATE TYPE "public"."token_purpose" AS ENUM('reset', 'setup');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('field_user', 'admin');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "action_type" NOT NULL,
	"result" "action_result",
	"resulting_status" "market_status" NOT NULL,
	"cooldown_until" timestamp with time zone,
	"geo_lat" numeric(10, 7),
	"geo_lng" numeric(10, 7),
	"distance_to_market_meters" integer,
	"geo_anonymized_at" timestamp with time zone,
	"offline_recorded" boolean DEFAULT false NOT NULL,
	"client_timestamp" timestamp with time zone,
	"client_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "valid_type_result" CHECK (
      ("action"."type" = 'visit' AND "action"."result" IN ('success','escalation','declined','no_contact'))
      OR ("action"."type" = 'profi_visit' AND "action"."result" IN ('success','declined'))
      OR ("action"."type" = 'delivery' AND "action"."result" IS NULL)
      OR ("action"."type" = 'control' AND "action"."result" IN ('ok','problem'))
      OR ("action"."type" = 'cancel_order' AND "action"."result" IS NULL)
      OR ("action"."type" = 'manual_override' AND "action"."result" IS NULL)
    ),
	CONSTRAINT "manual_override_payload" CHECK (
      "action"."type" != 'manual_override'
      OR (
        "action"."payload" ? 'target_status'
        AND "action"."payload"->>'target_status' IN ('gruen','gelb','orange','rosa','rot','grau')
        AND "action"."payload" ? 'reason'
        AND length("action"."payload"->>'reason') > 0
      )
    ),
	CONSTRAINT "cancel_order_has_reason" CHECK (
      "action"."type" != 'cancel_order'
      OR ("action"."payload" ? 'reason' AND length("action"."payload"->>'reason') > 0)
    ),
	CONSTRAINT "control_problem_has_description" CHECK (
      NOT ("action"."type" = 'control' AND "action"."result" = 'problem')
      OR ("action"."payload" ? 'problem_description' AND length("action"."payload"->>'problem_description') > 0)
    )
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event" varchar(100) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_event_in_allowed_list" CHECK ("audit_log"."event" IN (
        'user_invited', 'user_invited_email_failed', 'user_invitation_resent',
        'user_activated', 'user_deactivated', 'user_role_changed',
        'market_created', 'market_updated', 'market_deactivated',
        'market_reactivated', 'market_merged', 'markets_csv_imported',
        'cooldown_rule_changed', 'chain_created', 'chain_deactivated',
        'manual_override_performed', 'reservation_cancelled_by_admin',
        'geo_anonymization_run',
        'offline_conflict_reported', 'offline_conflict_resolved'
      ))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "chain_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cooldown_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_type" "action_type" NOT NULL,
	"result" "action_result",
	"duration_days" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid,
	CONSTRAINT "duration_non_negative" CHECK ("cooldown_rule"."duration_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"gln" char(13) NOT NULL,
	"street_full" varchar(250) NOT NULL,
	"postal_code" char(5) NOT NULL,
	"city" varchar(100) NOT NULL,
	"district" varchar(100),
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"contact_person" varchar(200),
	"contact_phone" varchar(50),
	"active" boolean DEFAULT true NOT NULL,
	"merged_into_id" uuid,
	"created_by_user_id" uuid,
	"external_id" varchar(100),
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gln_format" CHECK ("market"."gln" ~ '^[0-9]{13}$'),
	CONSTRAINT "postal_code_format" CHECK ("market"."postal_code" ~ '^[0-9]{5}$'),
	CONSTRAINT "merged_into_not_self" CHECK ("market"."merged_into_id" IS NULL OR "market"."merged_into_id" != "market"."id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"editable_until" timestamp with time zone DEFAULT NOW() + INTERVAL '24 hours' NOT NULL,
	CONSTRAINT "content_not_empty" CHECK (LENGTH(TRIM("note"."content")) > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reservation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" varchar(255),
	"name" varchar(200) NOT NULL,
	"role" "user_role" DEFAULT 'field_user' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "email_format" CHECK ("user"."email" ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "action" ADD CONSTRAINT "action_market_id_market_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."market"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "action" ADD CONSTRAINT "action_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cooldown_rule" ADD CONSTRAINT "cooldown_rule_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market" ADD CONSTRAINT "market_chain_id_chain_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chain"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market" ADD CONSTRAINT "market_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market" ADD CONSTRAINT "market_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "public"."market"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "note" ADD CONSTRAINT "note_market_id_market_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."market"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "note" ADD CONSTRAINT "note_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservation" ADD CONSTRAINT "reservation_market_id_market_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."market"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservation" ADD CONSTRAINT "reservation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservation" ADD CONSTRAINT "reservation_cancelled_by_user_id_user_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user" ADD CONSTRAINT "user_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_action_client_id" ON "action" USING btree ("user_id","client_id") WHERE "action"."client_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_action_market_created" ON "action" USING btree ("market_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_action_user_created" ON "action" USING btree ("user_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_action_type" ON "action" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_action_created_at" ON "action" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_action_cooldown_until" ON "action" USING btree ("cooldown_until") WHERE "action"."cooldown_until" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_action_geo_anonymize" ON "action" USING btree ("created_at") WHERE "action"."geo_anonymized_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_event" ON "audit_log" USING btree ("event","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_user" ON "audit_log" USING btree ("user_id","created_at" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_cooldown_rule_with_result" ON "cooldown_rule" USING btree ("action_type","result") WHERE "cooldown_rule"."result" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_cooldown_rule_no_result" ON "cooldown_rule" USING btree ("action_type") WHERE "cooldown_rule"."result" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_market_gln_active" ON "market" USING btree ("gln") WHERE "market"."active" = TRUE AND "market"."merged_into_id" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_market_chain" ON "market" USING btree ("chain_id") WHERE "market"."active" = TRUE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_market_name_trgm" ON "market" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_market_district" ON "market" USING btree ("district") WHERE "market"."active" = TRUE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_market_postal" ON "market" USING btree ("postal_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_market_created_at" ON "market" USING btree ("created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_note_market_created" ON "note" USING btree ("market_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_password_reset_token_user" ON "password_reset_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_password_reset_token_expires" ON "password_reset_token" USING btree ("expires_at") WHERE "password_reset_token"."consumed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_reservation_one_active_per_market" ON "reservation" USING btree ("market_id") WHERE "reservation"."active" = TRUE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reservation_user_active" ON "reservation" USING btree ("user_id") WHERE "reservation"."active" = TRUE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reservation_expires" ON "reservation" USING btree ("valid_until") WHERE "reservation"."active" = TRUE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_email" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_company" ON "user" USING btree ("company_id") WHERE "user"."active" = TRUE;