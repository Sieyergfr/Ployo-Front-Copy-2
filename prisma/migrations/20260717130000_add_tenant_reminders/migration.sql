-- CreateTable
CREATE TABLE "TenantReminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'Allgemein',
    "dueDate" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT NOT NULL DEFAULT '',
    "linkedFilesJson" TEXT NOT NULL DEFAULT '[]',
    "completedAt" DATETIME,
    "createdById" TEXT NOT NULL DEFAULT '',
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "TenantReminder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantReminder_tenantId_key_key" ON "TenantReminder"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TenantReminder_tenantId_status_idx" ON "TenantReminder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TenantReminder_tenantId_dueDate_idx" ON "TenantReminder"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "TenantReminder_priority_idx" ON "TenantReminder"("priority");
