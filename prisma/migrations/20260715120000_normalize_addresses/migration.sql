PRAGMA foreign_keys=OFF;

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "street" TEXT NOT NULL DEFAULT '',
    "houseNumber" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "careOf" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'DE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Preserve existing free-text addresses in the street field. Future edits use structured fields.
INSERT INTO "Address" ("id", "street", "updatedAt")
SELECT 'addr_settings_' || "id", "companyAddress", CURRENT_TIMESTAMP
FROM "TenantSettings"
WHERE TRIM("companyAddress") <> '';

INSERT INTO "Address" ("id", "street", "updatedAt")
SELECT 'addr_location_' || "id", "address", CURRENT_TIMESTAMP
FROM "TenantLocation"
WHERE TRIM("address") <> '';

INSERT INTO "Address" ("id", "street", "updatedAt")
SELECT 'addr_employee_private_' || "id", "privateAddress", CURRENT_TIMESTAMP
FROM "TenantEmployee"
WHERE TRIM("privateAddress") <> '';

INSERT INTO "Address" ("id", "street", "updatedAt")
SELECT 'addr_employee_work_' || "id", "address", CURRENT_TIMESTAMP
FROM "TenantEmployee"
WHERE TRIM("address") <> '';

-- RedefineTables
CREATE TABLE "new_TenantSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "companyAddressId" TEXT,
    CONSTRAINT "TenantSettings_companyAddressId_fkey" FOREIGN KEY ("companyAddressId") REFERENCES "Address" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TenantSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TenantSettings" ("id", "taxId", "defaultLocationId", "weekStart", "workHours", "vacationDays", "employeeNumberRequired", "archiveFormerEmployees", "mailNotifications", "inAppNotifications", "mobilePush", "deadlineAlerts", "absenceAlerts", "shiftAlerts", "digestTime", "twoFactorRequired", "sessionTimeout", "auditRetentionMonths", "billingNotifications", "createdAt", "updatedAt", "tenantId", "companyAddressId")
SELECT "id", "taxId", "defaultLocationId", "weekStart", "workHours", "vacationDays", "employeeNumberRequired", "archiveFormerEmployees", "mailNotifications", "inAppNotifications", "mobilePush", "deadlineAlerts", "absenceAlerts", "shiftAlerts", "digestTime", "twoFactorRequired", "sessionTimeout", "auditRetentionMonths", "billingNotifications", "createdAt", "updatedAt", "tenantId", CASE WHEN TRIM("companyAddress") <> '' THEN 'addr_settings_' || "id" ELSE NULL END
FROM "TenantSettings";
DROP TABLE "TenantSettings";
ALTER TABLE "new_TenantSettings" RENAME TO "TenantSettings";

CREATE TABLE "new_TenantLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressId" TEXT,
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "activeToday" INTEGER NOT NULL DEFAULT 0,
    "shiftCount" INTEGER NOT NULL DEFAULT 0,
    "openPositions" INTEGER NOT NULL DEFAULT 0,
    "utilization" TEXT NOT NULL DEFAULT '0%',
    "utilizationCaption" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "accentClassName" TEXT NOT NULL DEFAULT 'bg-ink',
    "leadInitials" TEXT NOT NULL DEFAULT '--',
    "leadName" TEXT NOT NULL DEFAULT 'Keine Leitung',
    "leadPhone" TEXT NOT NULL DEFAULT '',
    "leadEmail" TEXT NOT NULL DEFAULT '',
    "teamJson" TEXT NOT NULL DEFAULT '[]',
    "activityJson" TEXT NOT NULL DEFAULT '[]',
    "fileFoldersJson" TEXT NOT NULL DEFAULT '[]',
    "filesJson" TEXT NOT NULL DEFAULT '[]',
    "shiftPlanJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "TenantLocation_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TenantLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TenantLocation" ("id", "key", "kind", "name", "addressId", "employeeCount", "activeToday", "shiftCount", "openPositions", "utilization", "utilizationCaption", "status", "accentClassName", "leadInitials", "leadName", "leadPhone", "leadEmail", "teamJson", "activityJson", "fileFoldersJson", "filesJson", "shiftPlanJson", "createdAt", "updatedAt", "tenantId")
SELECT "id", "key", "kind", "name", CASE WHEN TRIM("address") <> '' THEN 'addr_location_' || "id" ELSE NULL END, "employeeCount", "activeToday", "shiftCount", "openPositions", "utilization", "utilizationCaption", "status", "accentClassName", "leadInitials", "leadName", "leadPhone", "leadEmail", "teamJson", "activityJson", "fileFoldersJson", "filesJson", "shiftPlanJson", "createdAt", "updatedAt", "tenantId"
FROM "TenantLocation";
DROP TABLE "TenantLocation";
ALTER TABLE "new_TenantLocation" RENAME TO "TenantLocation";

CREATE TABLE "new_TenantEmployee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "birthDate" TEXT NOT NULL DEFAULT '',
    "birthPlace" TEXT NOT NULL DEFAULT '',
    "nationality" TEXT NOT NULL DEFAULT '',
    "maritalStatus" TEXT NOT NULL DEFAULT '',
    "privateAddressId" TEXT,
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
    "workAddressId" TEXT,
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
    CONSTRAINT "TenantEmployee_privateAddressId_fkey" FOREIGN KEY ("privateAddressId") REFERENCES "Address" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TenantEmployee_workAddressId_fkey" FOREIGN KEY ("workAddressId") REFERENCES "Address" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TenantEmployee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TenantEmployee" ("id", "key", "initials", "name", "employeeNumber", "birthDate", "birthPlace", "nationality", "maritalStatus", "privateAddressId", "taxId", "socialSecurityNumber", "healthInsurance", "iban", "location", "team", "role", "startDate", "contract", "weeklyHours", "tenure", "status", "email", "phone", "workAddressId", "vacationRemaining", "vacationTotal", "vacationTaken", "documentsJson", "fileFoldersJson", "filesJson", "emergencyContactsJson", "payrollStatementsJson", "infoRequestsJson", "shiftsJson", "timelineJson", "contractDetailsJson", "createdAt", "updatedAt", "tenantId")
SELECT "id", "key", "initials", "name", "employeeNumber", "birthDate", "birthPlace", "nationality", "maritalStatus", CASE WHEN TRIM("privateAddress") <> '' THEN 'addr_employee_private_' || "id" ELSE NULL END, "taxId", "socialSecurityNumber", "healthInsurance", "iban", "location", "team", "role", "startDate", "contract", "weeklyHours", "tenure", "status", "email", "phone", CASE WHEN TRIM("address") <> '' THEN 'addr_employee_work_' || "id" ELSE NULL END, "vacationRemaining", "vacationTotal", "vacationTaken", "documentsJson", "fileFoldersJson", "filesJson", "emergencyContactsJson", "payrollStatementsJson", "infoRequestsJson", "shiftsJson", "timelineJson", "contractDetailsJson", "createdAt", "updatedAt", "tenantId"
FROM "TenantEmployee";
DROP TABLE "TenantEmployee";
ALTER TABLE "new_TenantEmployee" RENAME TO "TenantEmployee";

-- CreateIndex
CREATE INDEX "Address_country_idx" ON "Address"("country");
CREATE INDEX "Address_postalCode_city_idx" ON "Address"("postalCode", "city");
CREATE UNIQUE INDEX "TenantSettings_tenantId_key" ON "TenantSettings"("tenantId");
CREATE UNIQUE INDEX "TenantSettings_companyAddressId_key" ON "TenantSettings"("companyAddressId");
CREATE INDEX "TenantLocation_tenantId_idx" ON "TenantLocation"("tenantId");
CREATE UNIQUE INDEX "TenantLocation_tenantId_key_key" ON "TenantLocation"("tenantId", "key");
CREATE UNIQUE INDEX "TenantLocation_addressId_key" ON "TenantLocation"("addressId");
CREATE UNIQUE INDEX "TenantEmployee_tenantId_key_key" ON "TenantEmployee"("tenantId", "key");
CREATE INDEX "TenantEmployee_tenantId_idx" ON "TenantEmployee"("tenantId");
CREATE UNIQUE INDEX "TenantEmployee_privateAddressId_key" ON "TenantEmployee"("privateAddressId");
CREATE UNIQUE INDEX "TenantEmployee_workAddressId_key" ON "TenantEmployee"("workAddressId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
