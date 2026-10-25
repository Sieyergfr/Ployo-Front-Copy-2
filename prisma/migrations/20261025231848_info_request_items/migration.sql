-- CreateTable
CREATE TABLE "TenantEmployeeInfoRequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'document',
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'open',
    "value" TEXT NOT NULL DEFAULT '',
    "fileId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantEmployeeInfoRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantEmployeeInfoRequestItem_fileId_key" ON "TenantEmployeeInfoRequestItem"("fileId");

-- CreateIndex
CREATE INDEX "TenantEmployeeInfoRequestItem_requestId_position_idx" ON "TenantEmployeeInfoRequestItem"("requestId", "position");

-- AddForeignKey
ALTER TABLE "TenantEmployeeInfoRequestItem" ADD CONSTRAINT "TenantEmployeeInfoRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TenantEmployeeInfoRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployeeInfoRequestItem" ADD CONSTRAINT "TenantEmployeeInfoRequestItem_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "TenantFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
