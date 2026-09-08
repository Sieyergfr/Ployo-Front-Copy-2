-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "stripeLastEventCreatedAt" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "StripeWebhookEventStatus" AS ENUM ('processing', 'completed');

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "status" "StripeWebhookEventStatus" NOT NULL DEFAULT 'processing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_processedAt_idx" ON "StripeWebhookEvent"("processedAt");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_status_idx" ON "StripeWebhookEvent"("status");
