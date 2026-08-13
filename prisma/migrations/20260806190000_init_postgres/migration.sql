-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT,
    "count" INTEGER,
    "lastRequest" BIGINT,

    CONSTRAINT "rateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'DE',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "size" TEXT,
    "industry" TEXT,
    "contactEmail" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#2A6FDB',
    "plan" TEXT NOT NULL DEFAULT 'professional',
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantMembership" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT,

    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "invitedByName" TEXT NOT NULL DEFAULT '',
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "TenantInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSettings" (
    "id" TEXT NOT NULL,
    "taxId" TEXT NOT NULL DEFAULT '',
    "defaultLocationId" TEXT NOT NULL DEFAULT '',
    "weekStart" TEXT NOT NULL DEFAULT 'monday',
    "workHours" TEXT NOT NULL DEFAULT '40 Stunden pro Woche',
    "vacationDays" INTEGER NOT NULL DEFAULT 30,
    "shiftPresetsJson" TEXT NOT NULL DEFAULT '[]',
    "shiftMinStaffing" INTEGER NOT NULL DEFAULT 3,
    "shiftBreakRule" TEXT NOT NULL DEFAULT '30-6',
    "employeeNumberRequired" BOOLEAN NOT NULL DEFAULT true,
    "archiveFormerEmployees" BOOLEAN NOT NULL DEFAULT true,
    "mailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "inAppNotifications" BOOLEAN NOT NULL DEFAULT true,
    "mobilePush" BOOLEAN NOT NULL DEFAULT false,
    "deadlineAlerts" BOOLEAN NOT NULL DEFAULT true,
    "absenceAlerts" BOOLEAN NOT NULL DEFAULT true,
    "shiftAlerts" BOOLEAN NOT NULL DEFAULT true,
    "digestTime" TEXT NOT NULL DEFAULT 'monday-0800',
    "twoFactorRequired" BOOLEAN NOT NULL DEFAULT false,
    "sessionTimeout" BOOLEAN NOT NULL DEFAULT true,
    "auditRetentionMonths" INTEGER NOT NULL DEFAULT 24,
    "billingNotifications" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyAddressId" TEXT,

    CONSTRAINT "TenantSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "street" TEXT NOT NULL DEFAULT '',
    "houseNumber" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "careOf" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'DE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantRole" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "TenantRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantRolePermission" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "TenantRolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantTeam" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "locations" TEXT NOT NULL DEFAULT '',
    "colorClassName" TEXT NOT NULL DEFAULT 'bg-[#C9622A]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "TenantTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantTeamMember" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "contract" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'on-duty',
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "TenantTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantLocation" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressId" TEXT,
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "activeToday" INTEGER NOT NULL DEFAULT 0,
    "shiftCount" INTEGER NOT NULL DEFAULT 0,
    "openPositions" INTEGER NOT NULL DEFAULT 0,
    "utilization" TEXT NOT NULL DEFAULT '0%',
    "utilizationCaption" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "accentClassName" TEXT NOT NULL DEFAULT 'bg-ink',
    "leadInitials" TEXT NOT NULL DEFAULT '--',
    "leadName" TEXT NOT NULL DEFAULT 'Keine Leitung',
    "leadPhone" TEXT NOT NULL DEFAULT '',
    "leadEmail" TEXT NOT NULL DEFAULT '',
    "teamJson" TEXT NOT NULL DEFAULT '[]',
    "activityJson" TEXT NOT NULL DEFAULT '[]',
    "fileFoldersJson" TEXT NOT NULL DEFAULT '[]',
    "filesJson" TEXT NOT NULL DEFAULT '[]',
    "shiftPlanJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "TenantLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantEmployee" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT,
    "initials" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "birthDate" TEXT NOT NULL DEFAULT '',
    "birthPlace" TEXT NOT NULL DEFAULT '',
    "nationality" TEXT NOT NULL DEFAULT '',
    "maritalStatus" TEXT NOT NULL DEFAULT '',
    "privateAddressId" TEXT,
    "taxId" TEXT NOT NULL DEFAULT '',
    "socialSecurityNumber" TEXT NOT NULL DEFAULT '',
    "healthInsurance" TEXT NOT NULL DEFAULT '',
    "iban" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "team" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "startDate" TEXT NOT NULL DEFAULT '',
    "contract" TEXT NOT NULL DEFAULT 'Unbefristet',
    "weeklyHours" TEXT NOT NULL DEFAULT '',
    "tenure" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "workAddressId" TEXT,
    "vacationRemaining" INTEGER NOT NULL DEFAULT 0,
    "vacationTotal" INTEGER NOT NULL DEFAULT 30,
    "vacationTaken" INTEGER NOT NULL DEFAULT 0,
    "documentsJson" TEXT NOT NULL DEFAULT '[]',
    "fileFoldersJson" TEXT NOT NULL DEFAULT '[]',
    "filesJson" TEXT NOT NULL DEFAULT '[]',
    "emergencyContactsJson" TEXT NOT NULL DEFAULT '[]',
    "payrollStatementsJson" TEXT NOT NULL DEFAULT '[]',
    "infoRequestsJson" TEXT NOT NULL DEFAULT '[]',
    "shiftsJson" TEXT NOT NULL DEFAULT '[]',
    "timelineJson" TEXT NOT NULL DEFAULT '[]',
    "contractDetailsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "TenantEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSicknessReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "certificateStatus" TEXT NOT NULL DEFAULT 'pending',
    "reportChannel" TEXT NOT NULL DEFAULT 'app',
    "note" TEXT NOT NULL DEFAULT '',
    "reportedById" TEXT NOT NULL DEFAULT '',
    "reportedByName" TEXT NOT NULL DEFAULT '',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSicknessReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL DEFAULT '',
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantFile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT,
    "locationId" TEXT,
    "parentId" TEXT,
    "bucket" TEXT NOT NULL DEFAULT 'hr-documents',
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "extension" TEXT NOT NULL DEFAULT '',
    "folderSlug" TEXT NOT NULL DEFAULT 'allgemein',
    "folderName" TEXT NOT NULL DEFAULT 'Allgemein',
    "ownerName" TEXT NOT NULL DEFAULT 'HR',
    "uploadedById" TEXT NOT NULL DEFAULT '',
    "uploadedByName" TEXT NOT NULL DEFAULT '',
    "documentType" TEXT NOT NULL DEFAULT 'Sonstiges',
    "validFrom" TEXT NOT NULL DEFAULT '',
    "expiresAt" TEXT NOT NULL DEFAULT '',
    "reminderAt" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "assignedEmployeeId" TEXT NOT NULL DEFAULT '',
    "assignedEmployeeName" TEXT NOT NULL DEFAULT '',
    "assignedLocationId" TEXT NOT NULL DEFAULT '',
    "assignedLocationName" TEXT NOT NULL DEFAULT '',
    "accessRoleIdsJson" TEXT NOT NULL DEFAULT '[]',
    "accessRoleNamesJson" TEXT NOT NULL DEFAULT '[]',
    "accessUserIdsJson" TEXT NOT NULL DEFAULT '[]',
    "accessUserNamesJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT NOT NULL DEFAULT 's3',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantEmployeeContract" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contractType" TEXT NOT NULL DEFAULT 'Arbeitsvertrag',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL DEFAULT '',
    "probationEndDate" TEXT NOT NULL DEFAULT '',
    "noticePeriod" TEXT NOT NULL DEFAULT '',
    "position" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT '',
    "workLocation" TEXT NOT NULL DEFAULT '',
    "weeklyHours" TEXT NOT NULL DEFAULT '',
    "compensation" TEXT NOT NULL DEFAULT '',
    "vacationDays" INTEGER NOT NULL DEFAULT 0,
    "terminationDate" TEXT NOT NULL DEFAULT '',
    "terminationReason" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "TenantEmployeeContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantFileFolder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT,
    "locationId" TEXT,
    "parentId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'tenant',
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL DEFAULT 'HR',
    "status" TEXT NOT NULL DEFAULT 'active',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantFileFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantReminder" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'Allgemein',
    "dueDate" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT NOT NULL DEFAULT '',
    "linkedFilesJson" TEXT NOT NULL DEFAULT '[]',
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL DEFAULT '',
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "TenantReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantShift" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "weekday" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 30,
    "team" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "conflict" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT,
    "locationId" TEXT,

    CONSTRAINT "TenantShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantVacationRequest" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT NOT NULL DEFAULT '',
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "TenantVacationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantWishFreeRequest" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reason" TEXT NOT NULL DEFAULT '',
    "rejectReason" TEXT NOT NULL DEFAULT '',
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "TenantWishFreeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "TenantMembership_roleId_idx" ON "TenantMembership"("roleId");

-- CreateIndex
CREATE INDEX "TenantMembership_userId_idx" ON "TenantMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembership_tenantId_userId_key" ON "TenantMembership"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvitation_token_key" ON "TenantInvitation"("token");

-- CreateIndex
CREATE INDEX "TenantInvitation_email_idx" ON "TenantInvitation"("email");

-- CreateIndex
CREATE INDEX "TenantInvitation_token_idx" ON "TenantInvitation"("token");

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvitation_tenantId_email_key" ON "TenantInvitation"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSettings_tenantId_key" ON "TenantSettings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSettings_companyAddressId_key" ON "TenantSettings"("companyAddressId");

-- CreateIndex
CREATE INDEX "Address_country_idx" ON "Address"("country");

-- CreateIndex
CREATE INDEX "Address_postalCode_city_idx" ON "Address"("postalCode", "city");

-- CreateIndex
CREATE INDEX "TenantRole_tenantId_idx" ON "TenantRole"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantRole_tenantId_key_key" ON "TenantRole"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TenantRolePermission_area_idx" ON "TenantRolePermission"("area");

-- CreateIndex
CREATE UNIQUE INDEX "TenantRolePermission_roleId_area_key" ON "TenantRolePermission"("roleId", "area");

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

-- CreateIndex
CREATE UNIQUE INDEX "TenantLocation_addressId_key" ON "TenantLocation"("addressId");

-- CreateIndex
CREATE INDEX "TenantLocation_tenantId_idx" ON "TenantLocation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantLocation_tenantId_key_key" ON "TenantLocation"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TenantEmployee_privateAddressId_key" ON "TenantEmployee"("privateAddressId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantEmployee_workAddressId_key" ON "TenantEmployee"("workAddressId");

-- CreateIndex
CREATE INDEX "TenantEmployee_tenantId_idx" ON "TenantEmployee"("tenantId");

-- CreateIndex
CREATE INDEX "TenantEmployee_userId_idx" ON "TenantEmployee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantEmployee_tenantId_key_key" ON "TenantEmployee"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TenantEmployee_tenantId_employeeNumber_key" ON "TenantEmployee"("tenantId", "employeeNumber");

-- CreateIndex
CREATE INDEX "TenantSicknessReport_tenantId_status_idx" ON "TenantSicknessReport"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TenantSicknessReport_tenantId_startDate_idx" ON "TenantSicknessReport"("tenantId", "startDate");

-- CreateIndex
CREATE INDEX "TenantSicknessReport_employeeId_idx" ON "TenantSicknessReport"("employeeId");

-- CreateIndex
CREATE INDEX "TenantAuditLog_tenantId_createdAt_idx" ON "TenantAuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantAuditLog_tenantId_entityType_entityId_createdAt_idx" ON "TenantAuditLog"("tenantId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantAuditLog_actorId_idx" ON "TenantAuditLog"("actorId");

-- CreateIndex
CREATE INDEX "TenantFile_tenantId_status_idx" ON "TenantFile"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TenantFile_tenantId_folderSlug_idx" ON "TenantFile"("tenantId", "folderSlug");

-- CreateIndex
CREATE INDEX "TenantFile_employeeId_idx" ON "TenantFile"("employeeId");

-- CreateIndex
CREATE INDEX "TenantFile_locationId_idx" ON "TenantFile"("locationId");

-- CreateIndex
CREATE INDEX "TenantFile_assignedEmployeeId_idx" ON "TenantFile"("assignedEmployeeId");

-- CreateIndex
CREATE INDEX "TenantFile_assignedLocationId_idx" ON "TenantFile"("assignedLocationId");

-- CreateIndex
CREATE INDEX "TenantFile_parentId_idx" ON "TenantFile"("parentId");

-- CreateIndex
CREATE INDEX "TenantFile_bucket_storageKey_idx" ON "TenantFile"("bucket", "storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "TenantEmployeeContract_fileId_key" ON "TenantEmployeeContract"("fileId");

-- CreateIndex
CREATE INDEX "TenantEmployeeContract_tenantId_employeeId_status_idx" ON "TenantEmployeeContract"("tenantId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "TenantEmployeeContract_employeeId_startDate_idx" ON "TenantEmployeeContract"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "TenantFileFolder_tenantId_parentId_idx" ON "TenantFileFolder"("tenantId", "parentId");

-- CreateIndex
CREATE INDEX "TenantFileFolder_tenantId_status_idx" ON "TenantFileFolder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TenantFileFolder_employeeId_idx" ON "TenantFileFolder"("employeeId");

-- CreateIndex
CREATE INDEX "TenantFileFolder_locationId_idx" ON "TenantFileFolder"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantFileFolder_tenantId_scope_path_key" ON "TenantFileFolder"("tenantId", "scope", "path");

-- CreateIndex
CREATE INDEX "TenantReminder_tenantId_status_idx" ON "TenantReminder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TenantReminder_tenantId_dueDate_idx" ON "TenantReminder"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "TenantReminder_priority_idx" ON "TenantReminder"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "TenantReminder_tenantId_key_key" ON "TenantReminder"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TenantShift_tenantId_idx" ON "TenantShift"("tenantId");

-- CreateIndex
CREATE INDEX "TenantShift_employeeId_idx" ON "TenantShift"("employeeId");

-- CreateIndex
CREATE INDEX "TenantShift_locationId_idx" ON "TenantShift"("locationId");

-- CreateIndex
CREATE INDEX "TenantShift_date_idx" ON "TenantShift"("date");

-- CreateIndex
CREATE UNIQUE INDEX "TenantShift_tenantId_key_key" ON "TenantShift"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TenantVacationRequest_tenantId_idx" ON "TenantVacationRequest"("tenantId");

-- CreateIndex
CREATE INDEX "TenantVacationRequest_employeeId_idx" ON "TenantVacationRequest"("employeeId");

-- CreateIndex
CREATE INDEX "TenantVacationRequest_status_idx" ON "TenantVacationRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TenantVacationRequest_tenantId_key_key" ON "TenantVacationRequest"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TenantWishFreeRequest_tenantId_idx" ON "TenantWishFreeRequest"("tenantId");

-- CreateIndex
CREATE INDEX "TenantWishFreeRequest_employeeId_idx" ON "TenantWishFreeRequest"("employeeId");

-- CreateIndex
CREATE INDEX "TenantWishFreeRequest_date_idx" ON "TenantWishFreeRequest"("date");

-- CreateIndex
CREATE INDEX "TenantWishFreeRequest_status_idx" ON "TenantWishFreeRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TenantWishFreeRequest_tenantId_key_key" ON "TenantWishFreeRequest"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "TenantRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantInvitation" ADD CONSTRAINT "TenantInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSettings" ADD CONSTRAINT "TenantSettings_companyAddressId_fkey" FOREIGN KEY ("companyAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSettings" ADD CONSTRAINT "TenantSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantRole" ADD CONSTRAINT "TenantRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantRolePermission" ADD CONSTRAINT "TenantRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "TenantRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTeam" ADD CONSTRAINT "TenantTeam_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTeamMember" ADD CONSTRAINT "TenantTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TenantTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantLocation" ADD CONSTRAINT "TenantLocation_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantLocation" ADD CONSTRAINT "TenantLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployee" ADD CONSTRAINT "TenantEmployee_privateAddressId_fkey" FOREIGN KEY ("privateAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployee" ADD CONSTRAINT "TenantEmployee_workAddressId_fkey" FOREIGN KEY ("workAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployee" ADD CONSTRAINT "TenantEmployee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSicknessReport" ADD CONSTRAINT "TenantSicknessReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSicknessReport" ADD CONSTRAINT "TenantSicknessReport_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAuditLog" ADD CONSTRAINT "TenantAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFile" ADD CONSTRAINT "TenantFile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFile" ADD CONSTRAINT "TenantFile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFile" ADD CONSTRAINT "TenantFile_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "TenantLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFile" ADD CONSTRAINT "TenantFile_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TenantFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployeeContract" ADD CONSTRAINT "TenantEmployeeContract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployeeContract" ADD CONSTRAINT "TenantEmployeeContract_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployeeContract" ADD CONSTRAINT "TenantEmployeeContract_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "TenantFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFileFolder" ADD CONSTRAINT "TenantFileFolder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFileFolder" ADD CONSTRAINT "TenantFileFolder_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFileFolder" ADD CONSTRAINT "TenantFileFolder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "TenantLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFileFolder" ADD CONSTRAINT "TenantFileFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TenantFileFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantReminder" ADD CONSTRAINT "TenantReminder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantShift" ADD CONSTRAINT "TenantShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantShift" ADD CONSTRAINT "TenantShift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantShift" ADD CONSTRAINT "TenantShift_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "TenantLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantVacationRequest" ADD CONSTRAINT "TenantVacationRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantVacationRequest" ADD CONSTRAINT "TenantVacationRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantWishFreeRequest" ADD CONSTRAINT "TenantWishFreeRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantWishFreeRequest" ADD CONSTRAINT "TenantWishFreeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

