-- Behebt Schema-Drift: Migration 20260906213000_add_stripe_webhook_event_dedup
-- wurde per `prisma migrate resolve --applied` als angewendet markiert, ohne
-- dass ihr SQL tatsächlich gegen diese Datenbank lief (applied_steps_count=0,
-- started_at == finished_at). Die Tabelle "StripeWebhookEvent" hatte dadurch
-- nur "id" und "processedAt" -- "status"/"createdAt" fehlten, und
-- "processedAt" war NOT NULL/DEFAULT CURRENT_TIMESTAMP statt nullable, wie es
-- Code (app/api/webhooks/stripe/route.ts) und schema.prisma voraussetzen.
-- Per `prisma migrate diff --from-url <DB> --to-schema-datamodel
-- prisma/schema.prisma` erzeugt, um exakt den fehlenden Rest nachzuziehen.
--
-- Jede Anweisung ist bewusst idempotent (IF NOT EXISTS / Exception-Guard):
-- `prisma migrate deploy` spielt auf einer FRISCHEN Datenbank (z. B. CI) alle
-- Migrationen chronologisch nacheinander ein — dort lief die vorherige
-- Migration 20260906213000 bereits regulär durch und hat Typ/Spalten/Index
-- schon angelegt. Ohne die Guards brach ein zweites CREATE TYPE dort mit
-- "already exists" (42710) ab (siehe GitHub Actions: Apply migrations).

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StripeWebhookEventStatus" AS ENUM ('processing', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "StripeWebhookEvent"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "status" "StripeWebhookEventStatus" NOT NULL DEFAULT 'processing',
  ALTER COLUMN "processedAt" DROP NOT NULL,
  ALTER COLUMN "processedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StripeWebhookEvent_status_idx" ON "StripeWebhookEvent"("status");
