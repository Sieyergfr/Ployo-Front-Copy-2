-- CreateTable
CREATE TABLE "TenantEmployee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "birthDate" TEXT NOT NULL DEFAULT '',
    "birthPlace" TEXT NOT NULL DEFAULT '',
    "nationality" TEXT NOT NULL DEFAULT '',
    "maritalStatus" TEXT NOT NULL DEFAULT '',
    "privateAddress" TEXT NOT NULL DEFAULT '',
    "taxId" TEXT NOT NULL DEFAULT '',
    "socialSecurityNumber" TEXT NOT NULL DEFAULT '',
    "healthInsurance" TEXT NOT NULL DEFAULT '',
    "iban" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "team" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "startDate" TEXT NOT NULL DEFAULT '',
    "contract" TEXT NOT NULL DEFAULT 'Unbefristet',
    "weeklyHours" TEXT NOT NULL DEFAULT '',
    "tenure" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "vacationRemaining" INTEGER NOT NULL DEFAULT 0,
    "vacationTotal" INTEGER NOT NULL DEFAULT 30,
    "vacationTaken" INTEGER NOT NULL DEFAULT 0,
    "documentsJson" TEXT NOT NULL DEFAULT '[]',
    "fileFoldersJson" TEXT NOT NULL DEFAULT '[]',
    "filesJson" TEXT NOT NULL DEFAULT '[]',
    "emergencyContactsJson" TEXT NOT NULL DEFAULT '[]',
    "payrollStatementsJson" TEXT NOT NULL DEFAULT '[]',
    "infoRequestsJson" TEXT NOT NULL DEFAULT '[]',
    "shiftsJson" TEXT NOT NULL DEFAULT '[]',
    "timelineJson" TEXT NOT NULL DEFAULT '[]',
    "contractDetailsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "TenantEmployee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantEmployee_tenantId_key_key" ON "TenantEmployee"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TenantEmployee_tenantId_idx" ON "TenantEmployee"("tenantId");
