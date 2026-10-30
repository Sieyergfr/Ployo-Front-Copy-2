CREATE TABLE "TenantInfoRequestDraft" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantInfoRequestDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantInfoRequestDraft_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TenantInfoRequestDraft_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TenantInfoRequestDraft_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TenantInfoRequestDraft_tenantId_employeeId_authorId_key" ON "TenantInfoRequestDraft"("tenantId", "employeeId", "authorId");
CREATE INDEX "TenantInfoRequestDraft_authorId_idx" ON "TenantInfoRequestDraft"("authorId");
