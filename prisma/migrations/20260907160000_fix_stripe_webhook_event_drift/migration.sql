-- Behebt Schema-Drift: Migration 20260906213000_add_stripe_webhook_event_dedup
-- wurde per `prisma migrate resolve --applied` als angewendet markiert, ohne
-- dass ihr SQL tatsächlich gegen diese Datenbank lief (applied_steps_count=0,
-- started_at == finished_at). Die Tabelle "StripeWebhookEvent" hatte dadurch
-- nur "id" und "processedAt" -- "status"/"createdAt" fehlten, und
-- "processedAt" war NOT NULL/DEFAULT CURRENT_TIMESTAMP statt nullable, wie es
-- Code (app/api/webhooks/stripe/route.ts) und schema.prisma voraussetzen.
-- Per `prisma migrate diff --from-url <DB> --to-schema-datamodel
-- prisma/schema.prisma` erzeugt, um exakt den fehlenden Rest nachzuziehen.

-- CreateEnum
CREATE TYPE "StripeWebhookEventStatus" AS ENUM ('processing', 'completed');

-- AlterTable
ALTER TABLE "StripeWebhookEvent" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" "StripeWebhookEventStatus" NOT NULL DEFAULT 'processing',
ALTER COLUMN "processedAt" DROP NOT NULL,
ALTER COLUMN "processedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_status_idx" ON "StripeWebhookEvent"("status");
