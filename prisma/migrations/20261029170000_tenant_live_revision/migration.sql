-- A durable, transactionally updated cursor. Contains no employee data.
CREATE TABLE "TenantLiveRevision" (
  "tenantId" TEXT PRIMARY KEY REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "revision" TEXT NOT NULL
);

CREATE FUNCTION ployo_touch_live_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb;
  tenant_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN row_data := to_jsonb(OLD); ELSE row_data := to_jsonb(NEW); END IF;
  IF TG_NARGS = 2 THEN
    EXECUTE format('SELECT "tenantId" FROM %I WHERE "id" = $1', TG_ARGV[0])
      INTO tenant_id USING row_data ->> TG_ARGV[1];
  ELSIF TG_TABLE_NAME = 'Tenant' THEN
    tenant_id := row_data ->> 'id';
  ELSE
    tenant_id := row_data ->> 'tenantId';
  END IF;
  -- During cascading tenant deletion the parent is already gone.
  IF tenant_id IS NOT NULL AND EXISTS (SELECT 1 FROM "Tenant" WHERE "id" = tenant_id) THEN
    INSERT INTO "TenantLiveRevision" ("tenantId", "revision")
      VALUES (tenant_id, md5(random()::text || clock_timestamp()::text))
      ON CONFLICT ("tenantId") DO UPDATE SET "revision" = EXCLUDED."revision";
  END IF;
  RETURN NULL;
END;
$$;

-- Discover tenant-owned domain tables; technical/audit writes must not cause refresh loops.
DO $$
DECLARE domain_table record;
BEGIN
  FOR domain_table IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND column_name = 'tenantId'
      AND table_name LIKE 'Tenant%'
      AND table_name NOT IN ('TenantLiveRevision', 'TenantAuditLog', 'TenantEmployeeTimeline',
        'TenantTimeClockReminder', 'TenantInfoRequestDraft')
  LOOP
    EXECUTE format('CREATE TRIGGER ployo_live_revision AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION ployo_touch_live_revision()', domain_table.table_name);
  END LOOP;
END;
$$;
CREATE TRIGGER ployo_live_revision AFTER UPDATE ON "Tenant" FOR EACH ROW EXECUTE FUNCTION ployo_touch_live_revision();
CREATE TRIGGER ployo_live_revision AFTER INSERT OR UPDATE OR DELETE ON "TenantEmployeeInfoRequestItem" FOR EACH ROW EXECUTE FUNCTION ployo_touch_live_revision('TenantEmployeeInfoRequest', 'requestId');
CREATE TRIGGER ployo_live_revision AFTER INSERT OR UPDATE OR DELETE ON "TenantTimeBreak" FOR EACH ROW EXECUTE FUNCTION ployo_touch_live_revision('TenantTimeEntry', 'timeEntryId');
CREATE TRIGGER ployo_live_revision AFTER INSERT OR UPDATE OR DELETE ON "TenantTeamMember" FOR EACH ROW EXECUTE FUNCTION ployo_touch_live_revision('TenantTeam', 'teamId');
CREATE TRIGGER ployo_live_revision AFTER INSERT OR UPDATE OR DELETE ON "TenantLocationMember" FOR EACH ROW EXECUTE FUNCTION ployo_touch_live_revision('TenantLocation', 'locationId');
CREATE TRIGGER ployo_live_revision AFTER INSERT OR UPDATE OR DELETE ON "TenantRolePermission" FOR EACH ROW EXECUTE FUNCTION ployo_touch_live_revision('TenantRole', 'roleId');
