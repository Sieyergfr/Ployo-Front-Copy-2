-- CreateEnum
CREATE TYPE "Bundesland" AS ENUM ('BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH');

-- AlterTable
ALTER TABLE "TenantEmployee" ADD COLUMN     "vacationCarryover" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vacationCarryoverExpiresAt" TIMESTAMP(3),
ADD COLUMN     "vacationCarryoverRemindedAt" TIMESTAMP(3),
ADD COLUMN     "workDaysJson" JSONB NOT NULL DEFAULT '["Mo","Di","Mi","Do","Fr"]';

-- AlterTable
ALTER TABLE "TenantLocation" ADD COLUMN     "bundesland" "Bundesland";
