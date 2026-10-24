-- Abo-Sperre: Pflicht-Checkout für neu angelegte Mandanten, Kulanzphase bei
-- fehlgeschlagener Zahlung nur für Mandanten, die bereits gezahlt haben.
-- Rein additiv.

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "billingRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeHasPaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeFailedPaymentAttempts" INTEGER NOT NULL DEFAULT 0;

-- Backfill: Ein aktives Abo ohne Testphase wurde bereits bezahlt.
UPDATE "Tenant" SET "stripeHasPaid" = true WHERE "stripeSubscriptionStatus" = 'active';
