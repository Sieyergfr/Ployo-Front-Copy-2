-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('own', 'team', 'all');

-- AlterTable: default 'all' preserves current (tenant-wide) visibility for
-- every existing role permission — this migration only adds the capability,
-- it does not narrow anyone's access.
ALTER TABLE "TenantRolePermission" ADD COLUMN "scope" "PermissionScope" NOT NULL DEFAULT 'all';
