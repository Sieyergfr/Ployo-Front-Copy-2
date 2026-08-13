-- CreateEnum
CREATE TYPE "InfoRequestStatus" AS ENUM ('open', 'uploaded', 'review');

-- CreateTable
CREATE TABLE "TenantLocationMember" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "TenantLocationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantLocationActivity" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'ink',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "TenantLocationActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantEmployeeContractDetails" (
    "id" TEXT NOT NULL,
    "linkedFileName" TEXT NOT NULL DEFAULT 'Keine Vertragsdatei',
    "linkedFileMeta" TEXT NOT NULL DEFAULT 'Noch nicht hochgeladen',
    "contractType" TEXT NOT NULL DEFAULT '',
    "entryDate" TEXT NOT NULL DEFAULT '',
    "exitDate" TEXT NOT NULL DEFAULT '',
    "fixedTerm" TEXT NOT NULL DEFAULT '',
    "probation" TEXT NOT NULL DEFAULT '',
    "position" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT '',
    "supervisor" TEXT NOT NULL DEFAULT '',
    "workLocation" TEXT NOT NULL DEFAULT '',
    "parties" TEXT NOT NULL DEFAULT '',
    "compensation" TEXT NOT NULL DEFAULT '',
    "workingTime" TEXT NOT NULL DEFAULT '',
    "vacation" TEXT NOT NULL DEFAULT '',
    "noticePeriod" TEXT NOT NULL DEFAULT '',
    "collectiveAgreement" TEXT NOT NULL DEFAULT '',
    "clauses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "TenantEmployeeContractDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantEmployeeInfoRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "requestedBy" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "fileRequested" BOOLEAN NOT NULL DEFAULT false,
    "status" "InfoRequestStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "TenantEmployeeInfoRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantEmployeeTimeline" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'ink',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "TenantEmployeeTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantLocationMember_employeeId_idx" ON "TenantLocationMember"("employeeId");

-- CreateIndex
CREATE INDEX "TenantLocationMember_locationId_idx" ON "TenantLocationMember"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantLocationMember_locationId_employeeId_key" ON "TenantLocationMember"("locationId", "employeeId");

-- CreateIndex
CREATE INDEX "TenantLocationActivity_tenantId_locationId_createdAt_idx" ON "TenantLocationActivity"("tenantId", "locationId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantLocationActivity_locationId_idx" ON "TenantLocationActivity"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantEmployeeContractDetails_employeeId_key" ON "TenantEmployeeContractDetails"("employeeId");

-- CreateIndex
CREATE INDEX "TenantEmployeeContractDetails_tenantId_idx" ON "TenantEmployeeContractDetails"("tenantId");

-- CreateIndex
CREATE INDEX "TenantEmployeeInfoRequest_tenantId_employeeId_status_idx" ON "TenantEmployeeInfoRequest"("tenantId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "TenantEmployeeInfoRequest_employeeId_createdAt_idx" ON "TenantEmployeeInfoRequest"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantEmployeeTimeline_tenantId_employeeId_createdAt_idx" ON "TenantEmployeeTimeline"("tenantId", "employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantEmployeeTimeline_employeeId_idx" ON "TenantEmployeeTimeline"("employeeId");

-- AddForeignKey
ALTER TABLE "TenantLocationMember" ADD CONSTRAINT "TenantLocationMember_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "TenantLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantLocationActivity" ADD CONSTRAINT "TenantLocationActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantLocationActivity" ADD CONSTRAINT "TenantLocationActivity_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "TenantLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployeeContractDetails" ADD CONSTRAINT "TenantEmployeeContractDetails_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployeeContractDetails" ADD CONSTRAINT "TenantEmployeeContractDetails_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployeeInfoRequest" ADD CONSTRAINT "TenantEmployeeInfoRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployeeInfoRequest" ADD CONSTRAINT "TenantEmployeeInfoRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployeeTimeline" ADD CONSTRAINT "TenantEmployeeTimeline_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployeeTimeline" ADD CONSTRAINT "TenantEmployeeTimeline_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill TenantLocationMember from TenantLocation.teamJson (Einträge ohne
-- employeeId sind im bisherigen Code ohnehin für keinen Sync-Pfad erreichbar
-- und werden nicht übernommen).
INSERT INTO "TenantLocationMember" ("id", "employeeId", "initials", "name", "locationId", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    elem->>'employeeId',
    COALESCE(elem->>'initials', ''),
    COALESCE(elem->>'name', ''),
    tl."id",
    now(),
    now()
FROM "TenantLocation" tl,
     jsonb_array_elements(tl."teamJson"::jsonb) AS elem
WHERE COALESCE(elem->>'employeeId', '') <> '';

-- Backfill TenantLocationActivity from TenantLocation.activityJson. "time"
-- war ein vorformatierter Anzeige-String ohne Jahr (z. B. "11.08, 14:32")
-- und daher nicht in ein echtes Datum rekonstruierbar — createdAt wird
-- best-effort mit absteigendem Sekunden-Offset gesetzt, um die
-- ursprüngliche (neueste-zuerst) Reihenfolge zu erhalten.
INSERT INTO "TenantLocationActivity" ("id", "actor", "text", "tone", "tenantId", "locationId", "createdAt")
SELECT
    gen_random_uuid()::text,
    COALESCE(elem->>'actor', ''),
    COALESCE(elem->>'text', ''),
    COALESCE(elem->>'tone', 'ink'),
    tl."tenantId",
    tl."id",
    now() - ((ord - 1) || ' seconds')::interval
FROM "TenantLocation" tl,
     jsonb_array_elements(tl."activityJson"::jsonb) WITH ORDINALITY AS t(elem, ord);

-- Backfill TenantEmployeeInfoRequest from TenantEmployee.infoRequestsJson.
-- "requestedAt" war ebenfalls nur ein Anzeige-String und wird best-effort
-- mit absteigendem Sekunden-Offset rekonstruiert; "dueAt" folgte immer dem
-- festen Format dd.mm.yyyy und wird echt geparst.
INSERT INTO "TenantEmployeeInfoRequest" ("id", "title", "message", "requestedBy", "dueAt", "fileRequested", "status", "tenantId", "employeeId", "createdAt")
SELECT
    gen_random_uuid()::text,
    COALESCE(elem->>'title', ''),
    COALESCE(elem->>'message', ''),
    COALESCE(elem->>'requestedBy', ''),
    CASE
        WHEN elem->>'dueAt' ~ '^\d{2}\.\d{2}\.\d{4}$'
            THEN to_date(elem->>'dueAt', 'DD.MM.YYYY')
        ELSE NULL
    END,
    COALESCE((elem->>'fileRequested')::boolean, false),
    CASE
        WHEN elem->>'status' IN ('open', 'uploaded', 'review')
            THEN (elem->>'status')::"InfoRequestStatus"
        ELSE 'open'::"InfoRequestStatus"
    END,
    te."tenantId",
    te."id",
    now() - ((ord - 1) || ' seconds')::interval
FROM "TenantEmployee" te,
     jsonb_array_elements(te."infoRequestsJson"::jsonb) WITH ORDINALITY AS t(elem, ord);

-- Backfill TenantEmployeeTimeline from TenantEmployee.timelineJson. "date"
-- folgte immer dem festen Format dd.mm.yyyy (new Intl.DateTimeFormat
-- ("de-DE").format(...)) und wird echt geparst; ein absteigender
-- Sekunden-Offset hält gleichdatierte Einträge in ihrer ursprünglichen
-- (neueste-zuerst) Reihenfolge.
INSERT INTO "TenantEmployeeTimeline" ("id", "title", "tone", "tenantId", "employeeId", "createdAt")
SELECT
    gen_random_uuid()::text,
    COALESCE(elem->>'title', ''),
    COALESCE(elem->>'tone', 'ink'),
    te."tenantId",
    te."id",
    CASE
        WHEN elem->>'date' ~ '^\d{2}\.\d{2}\.\d{4}$'
            THEN to_timestamp(elem->>'date', 'DD.MM.YYYY') - ((ord - 1) || ' seconds')::interval
        ELSE now() - ((ord - 1) || ' seconds')::interval
    END
FROM "TenantEmployee" te,
     jsonb_array_elements(te."timelineJson"::jsonb) WITH ORDINALITY AS t(elem, ord);

-- Backfill TenantEmployeeContractDetails from TenantEmployee.contractDetailsJson
-- (1:1, nur für Mitarbeiter mit tatsächlich befülltem Blob — leere Blobs
-- ("{}") bleiben ohne Relation, der Lesepfad fällt dafür auf dieselben
-- Defaults zurück wie zuvor defaultContractDetails()).
INSERT INTO "TenantEmployeeContractDetails" (
    "id", "linkedFileName", "linkedFileMeta", "contractType", "entryDate", "exitDate",
    "fixedTerm", "probation", "position", "department", "supervisor", "workLocation",
    "parties", "compensation", "workingTime", "vacation", "noticePeriod", "collectiveAgreement",
    "clauses", "tenantId", "employeeId", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    COALESCE(te."contractDetailsJson"->>'linkedFileName', 'Keine Vertragsdatei'),
    COALESCE(te."contractDetailsJson"->>'linkedFileMeta', 'Noch nicht hochgeladen'),
    COALESCE(te."contractDetailsJson"->>'contractType', ''),
    COALESCE(te."contractDetailsJson"->>'entryDate', ''),
    COALESCE(te."contractDetailsJson"->>'exitDate', ''),
    COALESCE(te."contractDetailsJson"->>'fixedTerm', ''),
    COALESCE(te."contractDetailsJson"->>'probation', ''),
    COALESCE(te."contractDetailsJson"->>'position', ''),
    COALESCE(te."contractDetailsJson"->>'department', ''),
    COALESCE(te."contractDetailsJson"->>'supervisor', ''),
    COALESCE(te."contractDetailsJson"->>'workLocation', ''),
    COALESCE(te."contractDetailsJson"->>'parties', ''),
    COALESCE(te."contractDetailsJson"->>'compensation', ''),
    COALESCE(te."contractDetailsJson"->>'workingTime', ''),
    COALESCE(te."contractDetailsJson"->>'vacation', ''),
    COALESCE(te."contractDetailsJson"->>'noticePeriod', ''),
    COALESCE(te."contractDetailsJson"->>'collectiveAgreement', ''),
    COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(te."contractDetailsJson"->'clauses', '[]'::jsonb))),
        ARRAY[]::TEXT[]
    ),
    te."tenantId",
    te."id",
    now(),
    now()
FROM "TenantEmployee" te
WHERE te."contractDetailsJson"::jsonb <> '{}'::jsonb;

-- AlterTable (Legacy-JSON-Spalten erst nach erfolgreichem Backfill entfernen)
ALTER TABLE "TenantEmployee" DROP COLUMN "contractDetailsJson",
DROP COLUMN "infoRequestsJson",
DROP COLUMN "timelineJson";

-- AlterTable
ALTER TABLE "TenantLocation" DROP COLUMN "activityJson",
DROP COLUMN "teamJson";
