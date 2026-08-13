-- Drop dead denormalized shift snapshots. Both were fully shadowed by the
-- real TenantShift relation: TenantEmployee.shiftsJson was written once at
-- create time and never updated (always empty), and TenantLocation.shiftPlanJson
-- fed an employee-roster UI tab that was never mounted in the app.
ALTER TABLE "TenantEmployee" DROP COLUMN "shiftsJson";
ALTER TABLE "TenantLocation" DROP COLUMN "shiftPlanJson";
