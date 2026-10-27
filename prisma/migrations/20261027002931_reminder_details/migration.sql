-- AlterTable
ALTER TABLE "TenantReminder" ADD COLUMN     "checklistJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "ownerUserId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "recurrence" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "remindDaysBefore" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "subjectId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "subjectType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "suggestionKey" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "TenantReminderSuggestionDismissal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantReminderSuggestionDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantReminderSuggestionDismissal_tenantId_key_key" ON "TenantReminderSuggestionDismissal"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "TenantReminderSuggestionDismissal" ADD CONSTRAINT "TenantReminderSuggestionDismissal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
