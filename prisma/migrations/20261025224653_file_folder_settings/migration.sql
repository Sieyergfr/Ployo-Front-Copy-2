-- AlterTable
ALTER TABLE "TenantFileFolder" ADD COLUMN     "accessRoleIdsJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sharedWithEmployees" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visibleLocationIdsJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "visibleTeamIdsJson" JSONB NOT NULL DEFAULT '[]';
