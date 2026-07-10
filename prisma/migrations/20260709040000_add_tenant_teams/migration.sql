-- CreateTable
CREATE TABLE "TenantTeam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "locations" TEXT NOT NULL DEFAULT '',
    "colorClassName" TEXT NOT NULL DEFAULT 'bg-[#C9622A]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "TenantTeam_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TenantTeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "contract" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'on-duty',
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "teamId" TEXT NOT NULL,
    CONSTRAINT "TenantTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TenantTeam" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TenantTeam_tenantId_idx" ON "TenantTeam"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantTeam_tenantId_key_key" ON "TenantTeam"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TenantTeamMember_employeeId_idx" ON "TenantTeamMember"("employeeId");

-- CreateIndex
CREATE INDEX "TenantTeamMember_teamId_idx" ON "TenantTeamMember"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantTeamMember_teamId_employeeId_key" ON "TenantTeamMember"("teamId", "employeeId");
