-- CreateTable
CREATE TABLE "TenantSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyAddress" TEXT NOT NULL DEFAULT '',
    "taxId" TEXT NOT NULL DEFAULT '',
    "defaultLocationId" TEXT NOT NULL DEFAULT '',
    "weekStart" TEXT NOT NULL DEFAULT 'monday',
    "workHours" TEXT NOT NULL DEFAULT '40 Stunden pro Woche',
    "vacationDays" INTEGER NOT NULL DEFAULT 30,
    "employeeNumberRequired" BOOLEAN NOT NULL DEFAULT true,
    "archiveFormerEmployees" BOOLEAN NOT NULL DEFAULT true,
    "mailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "inAppNotifications" BOOLEAN NOT NULL DEFAULT true,
    "mobilePush" BOOLEAN NOT NULL DEFAULT false,
    "deadlineAlerts" BOOLEAN NOT NULL DEFAULT true,
    "absenceAlerts" BOOLEAN NOT NULL DEFAULT true,
    "shiftAlerts" BOOLEAN NOT NULL DEFAULT true,
    "digestTime" TEXT NOT NULL DEFAULT 'monday-0800',
    "twoFactorRequired" BOOLEAN NOT NULL DEFAULT false,
    "sessionTimeout" BOOLEAN NOT NULL DEFAULT true,
    "auditRetentionMonths" INTEGER NOT NULL DEFAULT 24,
    "billingNotifications" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "TenantSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantSettings_tenantId_key" ON "TenantSettings"("tenantId");
