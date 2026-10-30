-- Take the shared cursor lock only after domain writes have completed. Otherwise
-- concurrent multi-row mutations could hold different domain rows while waiting
-- for the tenant cursor and produce an avoidable lock-order inversion.
DO $$
DECLARE live_trigger record;
DECLARE definition text;
BEGIN
  FOR live_trigger IN
    SELECT t.oid, t.tgname, c.relname, n.nspname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'ployo_live_revision' AND n.nspname = current_schema()
  LOOP
    definition := pg_get_triggerdef(live_trigger.oid);
    definition := replace(definition, 'CREATE TRIGGER ', 'CREATE CONSTRAINT TRIGGER ');
    definition := replace(definition, ' FOR EACH ROW ', ' DEFERRABLE INITIALLY DEFERRED FOR EACH ROW ');
    EXECUTE format('DROP TRIGGER %I ON %I.%I', live_trigger.tgname, live_trigger.nspname, live_trigger.relname);
    EXECUTE definition;
  END LOOP;
END;
$$;
