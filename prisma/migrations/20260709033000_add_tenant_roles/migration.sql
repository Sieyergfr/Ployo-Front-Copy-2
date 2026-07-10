-- CreateTable
CREATE TABLE "TenantRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "TenantRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TenantRolePermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "area" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'none',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "roleId" TEXT NOT NULL,
    CONSTRAINT "TenantRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "TenantRole" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TenantMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT,
    CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TenantMembership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "TenantRole" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TenantMembership" ("createdAt", "id", "role", "tenantId", "updatedAt", "userId") SELECT "createdAt", "id", "role", "tenantId", "updatedAt", "userId" FROM "TenantMembership";
DROP TABLE "TenantMembership";
ALTER TABLE "new_TenantMembership" RENAME TO "TenantMembership";
CREATE INDEX "TenantMembership_roleId_idx" ON "TenantMembership"("roleId");
CREATE INDEX "TenantMembership_userId_idx" ON "TenantMembership"("userId");
CREATE UNIQUE INDEX "TenantMembership_tenantId_userId_key" ON "TenantMembership"("tenantId", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TenantRole_tenantId_idx" ON "TenantRole"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantRole_tenantId_key_key" ON "TenantRole"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TenantRolePermission_area_idx" ON "TenantRolePermission"("area");

-- CreateIndex
CREATE UNIQUE INDEX "TenantRolePermission_roleId_area_key" ON "TenantRolePermission"("roleId", "area");
