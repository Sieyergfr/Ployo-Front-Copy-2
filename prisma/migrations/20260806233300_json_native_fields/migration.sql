-- Drop confirmed-dead JSON-string columns (never read anywhere in application code,
-- fully shadowed by the storageFiles/storageFileFolders relations).
ALTER TABLE "TenantEmployee" DROP COLUMN "fileFoldersJson";
ALTER TABLE "TenantEmployee" DROP COLUMN "filesJson";
ALTER TABLE "TenantLocation" DROP COLUMN "fileFoldersJson";
ALTER TABLE "TenantLocation" DROP COLUMN "filesJson";

-- Convert live JSON-string columns to native jsonb, casting existing data in place
-- instead of dropping/recreating the columns. The old text default has to be
-- dropped first since Postgres can't auto-cast a text default to jsonb.
ALTER TABLE "TenantEmployee"
  ALTER COLUMN "documentsJson" DROP DEFAULT,
  ALTER COLUMN "emergencyContactsJson" DROP DEFAULT,
  ALTER COLUMN "payrollStatementsJson" DROP DEFAULT,
  ALTER COLUMN "infoRequestsJson" DROP DEFAULT,
  ALTER COLUMN "timelineJson" DROP DEFAULT,
  ALTER COLUMN "contractDetailsJson" DROP DEFAULT;

ALTER TABLE "TenantEmployee"
  ALTER COLUMN "documentsJson" TYPE JSONB USING "documentsJson"::jsonb,
  ALTER COLUMN "emergencyContactsJson" TYPE JSONB USING "emergencyContactsJson"::jsonb,
  ALTER COLUMN "payrollStatementsJson" TYPE JSONB USING "payrollStatementsJson"::jsonb,
  ALTER COLUMN "infoRequestsJson" TYPE JSONB USING "infoRequestsJson"::jsonb,
  ALTER COLUMN "timelineJson" TYPE JSONB USING "timelineJson"::jsonb,
  ALTER COLUMN "contractDetailsJson" TYPE JSONB USING "contractDetailsJson"::jsonb;

ALTER TABLE "TenantEmployee"
  ALTER COLUMN "documentsJson" SET DEFAULT '[]',
  ALTER COLUMN "emergencyContactsJson" SET DEFAULT '[]',
  ALTER COLUMN "payrollStatementsJson" SET DEFAULT '[]',
  ALTER COLUMN "infoRequestsJson" SET DEFAULT '[]',
  ALTER COLUMN "timelineJson" SET DEFAULT '[]',
  ALTER COLUMN "contractDetailsJson" SET DEFAULT '{}';

ALTER TABLE "TenantFile"
  ALTER COLUMN "tagsJson" DROP DEFAULT,
  ALTER COLUMN "accessRoleIdsJson" DROP DEFAULT,
  ALTER COLUMN "accessRoleNamesJson" DROP DEFAULT,
  ALTER COLUMN "accessUserIdsJson" DROP DEFAULT,
  ALTER COLUMN "accessUserNamesJson" DROP DEFAULT;

ALTER TABLE "TenantFile"
  ALTER COLUMN "tagsJson" TYPE JSONB USING "tagsJson"::jsonb,
  ALTER COLUMN "accessRoleIdsJson" TYPE JSONB USING "accessRoleIdsJson"::jsonb,
  ALTER COLUMN "accessRoleNamesJson" TYPE JSONB USING "accessRoleNamesJson"::jsonb,
  ALTER COLUMN "accessUserIdsJson" TYPE JSONB USING "accessUserIdsJson"::jsonb,
  ALTER COLUMN "accessUserNamesJson" TYPE JSONB USING "accessUserNamesJson"::jsonb;

ALTER TABLE "TenantFile"
  ALTER COLUMN "tagsJson" SET DEFAULT '[]',
  ALTER COLUMN "accessRoleIdsJson" SET DEFAULT '[]',
  ALTER COLUMN "accessRoleNamesJson" SET DEFAULT '[]',
  ALTER COLUMN "accessUserIdsJson" SET DEFAULT '[]',
  ALTER COLUMN "accessUserNamesJson" SET DEFAULT '[]';

ALTER TABLE "TenantLocation"
  ALTER COLUMN "teamJson" DROP DEFAULT,
  ALTER COLUMN "activityJson" DROP DEFAULT;

ALTER TABLE "TenantLocation"
  ALTER COLUMN "teamJson" TYPE JSONB USING "teamJson"::jsonb,
  ALTER COLUMN "activityJson" TYPE JSONB USING "activityJson"::jsonb;

ALTER TABLE "TenantLocation"
  ALTER COLUMN "teamJson" SET DEFAULT '[]',
  ALTER COLUMN "activityJson" SET DEFAULT '[]';

ALTER TABLE "TenantReminder"
  ALTER COLUMN "linkedFilesJson" DROP DEFAULT;

ALTER TABLE "TenantReminder"
  ALTER COLUMN "linkedFilesJson" TYPE JSONB USING "linkedFilesJson"::jsonb;

ALTER TABLE "TenantReminder"
  ALTER COLUMN "linkedFilesJson" SET DEFAULT '[]';

ALTER TABLE "TenantSettings"
  ALTER COLUMN "shiftPresetsJson" DROP DEFAULT;

ALTER TABLE "TenantSettings"
  ALTER COLUMN "shiftPresetsJson" TYPE JSONB USING "shiftPresetsJson"::jsonb;

ALTER TABLE "TenantSettings"
  ALTER COLUMN "shiftPresetsJson" SET DEFAULT '[]';
