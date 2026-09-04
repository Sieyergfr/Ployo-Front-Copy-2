-- AlterTable
ALTER TABLE "TenantEmployee" ADD COLUMN     "legalHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legalHoldReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "offboardedAt" TIMESTAMP(3),
ADD COLUMN     "piiAnonymizedAt" TIMESTAMP(3);
