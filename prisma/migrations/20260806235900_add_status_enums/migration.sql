-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'HR', 'EMPLOYEE');
CREATE TYPE "InvitationRole" AS ENUM ('ADMIN', 'HR', 'EMPLOYEE');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED');
CREATE TYPE "TenantPlan" AS ENUM ('starter', 'professional', 'business');
CREATE TYPE "BillingCycle" AS ENUM ('monthly', 'yearly');
CREATE TYPE "PermissionLevel" AS ENUM ('none', 'read', 'write', 'admin');
CREATE TYPE "LocationStatus" AS ENUM ('active', 'inactive');
CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'vacation', 'absent');
CREATE TYPE "SicknessStatus" AS ENUM ('open', 'closed');
CREATE TYPE "FileStatus" AS ENUM ('active', 'deleted', 'replaced');
CREATE TYPE "ContractStatus" AS ENUM ('draft', 'active', 'terminated', 'expired', 'inactive');
CREATE TYPE "ReminderPriority" AS ENUM ('urgent', 'important', 'normal');
CREATE TYPE "ReminderStatus" AS ENUM ('open', 'done');
CREATE TYPE "Weekday" AS ENUM ('Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So');
CREATE TYPE "VacationRequestStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "WishFreeRequestStatus" AS ENUM ('open', 'approved', 'rejected');
CREATE TYPE "FileFolderStatus" AS ENUM ('active', 'inactive');

-- Data prep: normalize legacy lowercase role values before locking the column
-- to a case-sensitive enum. Current write paths already only ever write
-- uppercase, so this is a one-time backfill for historical rows.
UPDATE "TenantMembership" SET role = UPPER(role);

-- Data prep: TenantFile's soft-delete marker was spelled "delete" (a verb, not
-- a past-tense status like its siblings "active"/"replaced"). Renaming here
-- to "deleted" for consistency before locking the column to an enum.
UPDATE "TenantFile" SET status = 'deleted' WHERE status = 'delete';

-- AlterTable: TenantMembership.role
ALTER TABLE "TenantMembership" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "TenantMembership" ALTER COLUMN "role" TYPE "MembershipRole" USING "role"::"MembershipRole";
ALTER TABLE "TenantMembership" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';

-- AlterTable: TenantInvitation.role, status
ALTER TABLE "TenantInvitation" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "TenantInvitation" ALTER COLUMN "role" TYPE "InvitationRole" USING "role"::"InvitationRole";
ALTER TABLE "TenantInvitation" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';

ALTER TABLE "TenantInvitation" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TenantInvitation" ALTER COLUMN "status" TYPE "InvitationStatus" USING "status"::"InvitationStatus";
ALTER TABLE "TenantInvitation" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable: Tenant.plan, billingCycle
ALTER TABLE "Tenant" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "Tenant" ALTER COLUMN "plan" TYPE "TenantPlan" USING "plan"::"TenantPlan";
ALTER TABLE "Tenant" ALTER COLUMN "plan" SET DEFAULT 'professional';

ALTER TABLE "Tenant" ALTER COLUMN "billingCycle" DROP DEFAULT;
ALTER TABLE "Tenant" ALTER COLUMN "billingCycle" TYPE "BillingCycle" USING "billingCycle"::"BillingCycle";
ALTER TABLE "Tenant" ALTER COLUMN "billingCycle" SET DEFAULT 'monthly';

-- AlterTable: TenantRolePermission.level
ALTER TABLE "TenantRolePermission" ALTER COLUMN "level" DROP DEFAULT;
ALTER TABLE "TenantRolePermission" ALTER COLUMN "level" TYPE "PermissionLevel" USING "level"::"PermissionLevel";
ALTER TABLE "TenantRolePermission" ALTER COLUMN "level" SET DEFAULT 'none';

-- AlterTable: TenantLocation.status
ALTER TABLE "TenantLocation" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TenantLocation" ALTER COLUMN "status" TYPE "LocationStatus" USING "status"::"LocationStatus";
ALTER TABLE "TenantLocation" ALTER COLUMN "status" SET DEFAULT 'active';

-- AlterTable: TenantEmployee.status
ALTER TABLE "TenantEmployee" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TenantEmployee" ALTER COLUMN "status" TYPE "EmployeeStatus" USING "status"::"EmployeeStatus";
ALTER TABLE "TenantEmployee" ALTER COLUMN "status" SET DEFAULT 'active';

-- AlterTable: TenantSicknessReport.status
ALTER TABLE "TenantSicknessReport" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TenantSicknessReport" ALTER COLUMN "status" TYPE "SicknessStatus" USING "status"::"SicknessStatus";
ALTER TABLE "TenantSicknessReport" ALTER COLUMN "status" SET DEFAULT 'open';

-- AlterTable: TenantFile.status
ALTER TABLE "TenantFile" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TenantFile" ALTER COLUMN "status" TYPE "FileStatus" USING "status"::"FileStatus";
ALTER TABLE "TenantFile" ALTER COLUMN "status" SET DEFAULT 'active';

-- AlterTable: TenantEmployeeContract.status
ALTER TABLE "TenantEmployeeContract" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TenantEmployeeContract" ALTER COLUMN "status" TYPE "ContractStatus" USING "status"::"ContractStatus";
ALTER TABLE "TenantEmployeeContract" ALTER COLUMN "status" SET DEFAULT 'draft';

-- AlterTable: TenantFileFolder.status
ALTER TABLE "TenantFileFolder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TenantFileFolder" ALTER COLUMN "status" TYPE "FileFolderStatus" USING "status"::"FileFolderStatus";
ALTER TABLE "TenantFileFolder" ALTER COLUMN "status" SET DEFAULT 'active';

-- AlterTable: TenantReminder.priority, status
ALTER TABLE "TenantReminder" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "TenantReminder" ALTER COLUMN "priority" TYPE "ReminderPriority" USING "priority"::"ReminderPriority";
ALTER TABLE "TenantReminder" ALTER COLUMN "priority" SET DEFAULT 'normal';

ALTER TABLE "TenantReminder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TenantReminder" ALTER COLUMN "status" TYPE "ReminderStatus" USING "status"::"ReminderStatus";
ALTER TABLE "TenantReminder" ALTER COLUMN "status" SET DEFAULT 'open';

-- AlterTable: TenantShift.weekday (no default, always computed by the app)
ALTER TABLE "TenantShift" ALTER COLUMN "weekday" TYPE "Weekday" USING "weekday"::"Weekday";

-- AlterTable: TenantVacationRequest.status
ALTER TABLE "TenantVacationRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TenantVacationRequest" ALTER COLUMN "status" TYPE "VacationRequestStatus" USING "status"::"VacationRequestStatus";
ALTER TABLE "TenantVacationRequest" ALTER COLUMN "status" SET DEFAULT 'pending';

-- AlterTable: TenantWishFreeRequest.status
ALTER TABLE "TenantWishFreeRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TenantWishFreeRequest" ALTER COLUMN "status" TYPE "WishFreeRequestStatus" USING "status"::"WishFreeRequestStatus";
ALTER TABLE "TenantWishFreeRequest" ALTER COLUMN "status" SET DEFAULT 'open';
