-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "country" TEXT NOT NULL DEFAULT 'DE';
ALTER TABLE "Tenant" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin';
ALTER TABLE "Tenant" ADD COLUMN "size" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "industry" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "primaryColor" TEXT NOT NULL DEFAULT '#2A6FDB';
ALTER TABLE "Tenant" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'professional';
ALTER TABLE "Tenant" ADD COLUMN "billingCycle" TEXT NOT NULL DEFAULT 'monthly';

-- CreateTable
CREATE TABLE "TenantInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "TenantInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvitation_tenantId_email_key" ON "TenantInvitation"("tenantId", "email");

-- CreateIndex
CREATE INDEX "TenantInvitation_email_idx" ON "TenantInvitation"("email");
