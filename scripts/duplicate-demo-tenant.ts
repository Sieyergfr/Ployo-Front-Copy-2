/**
 * Ersetzt den Betrieb von demo@ployo.io (Slug `ployo-demo`) durch ein
 * vollstaendiges Duplikat des Google-Play-Demo-Betriebs `ployo-demo-gastro`
 * (Inhaber demo.test@ployo.io).
 *
 * Ablauf (EINE DB-Transaktion):
 *   1. Alten Tenant `ployo-demo` samt aller Daten loeschen, ebenso das
 *      Login lena.hoffmann@ployo.io (gehoerte nur zu diesem Tenant).
 *   2. Jede Zeile des Quell-Tenants (alle Tenant-Tabellen + Kind-Tabellen +
 *      Adressen) generisch kopieren; jede ID bekommt eine neue ID, die
 *      Ersetzung laeuft ueber alle Text-/JSON-Spalten (Fremdschluessel,
 *      Snapshots, Storage-Keys). demo.test@ployo.io -> demo@ployo.io
 *      (User-ID und E-Mail). Die uebrigen 24 Testkonten werden zusaetzlich
 *      Mitglied im neuen Tenant (gleiche Logins).
 *   3. Stempel-QR-Tokens werden neu erzeugt (global eindeutig).
 *
 * Storage: Objekte werden VOR der Transaktion serverseitig unter die neuen
 * Keys kopiert (verwaiste Kopien bei Abbruch sind harmlos); Objekte des
 * alten Tenants werden erst NACH dem Commit geloescht.
 *
 * --dry-run: alles in der Transaktion ausfuehren, dann zurueckrollen; kein
 * Storage-Zugriff.
 *
 * Aufruf: NODE_OPTIONS="--require <stub-server-only.cjs> --require dotenv/config" \
 *   npx tsx scripts/duplicate-demo-tenant.ts [--dry-run]
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { CopyObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getStorageClient } from "../lib/storage/client";
import { generateClockQrToken } from "../lib/time-clock-qr";

const DRY_RUN = process.argv.includes("--dry-run");
const SOURCE_SLUG = "ployo-demo-gastro";
const TARGET_SLUG = "ployo-demo";
const SOURCE_OWNER_EMAIL = "demo.test@ployo.io";
const TARGET_OWNER_EMAIL = "demo@ployo.io";
const REMOVE_USER_EMAILS = ["lena.hoffmann@ployo.io"];

const cuid = () => "c" + randomBytes(12).toString("hex").slice(0, 24);
const q = (table: string) => `"${table}"`;

/** Kopier-Reihenfolge (Fremdschluessel zuerst). `where` selektiert die Quellzeilen. */
type TableSpec = { table: string; where: string; orderBy?: string };
const tablesFor = (): TableSpec[] => {
  const byTenant = (table: string, orderBy?: string): TableSpec => ({ table, where: `"tenantId" = $1`, orderBy });
  return [
    { table: "Address", where: `id in (select "companyAddressId" from "TenantSettings" where "tenantId" = $1 union select "addressId" from "TenantLocation" where "tenantId" = $1)` },
    { table: "EmployeeAddress", where: `id in (select "privateAddressId" from "TenantEmployee" where "tenantId" = $1 union select "workAddressId" from "TenantEmployee" where "tenantId" = $1)` },
    byTenant("TenantRole"),
    { table: "TenantRolePermission", where: `"roleId" in (select id from "TenantRole" where "tenantId" = $1)` },
    byTenant("TenantSettings"),
    byTenant("TenantEmployee"),
    byTenant("TenantLocation"),
    { table: "TenantLocationMember", where: `"locationId" in (select id from "TenantLocation" where "tenantId" = $1)` },
    byTenant("TenantLocationActivity"),
    byTenant("TenantTeam"),
    { table: "TenantTeamMember", where: `"teamId" in (select id from "TenantTeam" where "tenantId" = $1)` },
    byTenant("TenantMembership"),
    // Selbstreferenz parentId: Eltern zuerst
    byTenant("TenantFile", `("parentId" is not null), "createdAt"`),
    byTenant("TenantFileFolder", `("parentId" is not null), length(path)`),
    byTenant("TenantEmployeeFolderTemplate"),
    byTenant("TenantEmployeeContract"),
    byTenant("TenantEmployeeContractDetails"),
    byTenant("TenantPayrollStatement"),
    byTenant("TenantEmployeeInfoRequest"),
    byTenant("TenantEmployeeTimeline"),
    byTenant("TenantSicknessReport"),
    byTenant("TenantEmployeeNotification"),
    byTenant("TenantAuditLog"),
    byTenant("TenantReminder"),
    byTenant("TenantShift"),
    byTenant("TenantShiftTemplate"),
    byTenant("TenantShiftWeek"),
    byTenant("TenantVacationRequest"),
    byTenant("TenantWishFreeRequest"),
    byTenant("TenantTimeEntry"),
    { table: "TenantTimeBreak", where: `"timeEntryId" in (select id from "TenantTimeEntry" where "tenantId" = $1)` },
    byTenant("TenantTimeClockReminder"),
    byTenant("TenantReportRecipient"),
  ];
};
/** Werden bewusst nicht kopiert (offene Einladungen gehoeren zum Quell-Betrieb). */
const SKIPPED_TENANT_TABLES = ["TenantInvitation"];

class DryRunRollback extends Error {}

async function main() {
  const prisma = new PrismaClient();
  try {
    const source = await prisma.tenant.findUnique({ where: { slug: SOURCE_SLUG } });
    if (!source) throw new Error(`Quell-Tenant ${SOURCE_SLUG} fehlt`);
    const oldTarget = await prisma.tenant.findUnique({ where: { slug: TARGET_SLUG }, select: { id: true, name: true } });
    const sourceOwner = await prisma.user.findUnique({ where: { email: SOURCE_OWNER_EMAIL }, select: { id: true } });
    const targetOwner = await prisma.user.findUnique({ where: { email: TARGET_OWNER_EMAIL }, select: { id: true, name: true } });
    if (!sourceOwner || !targetOwner) throw new Error("Inhaber-Konten fehlen");

    // Sicherheitscheck: demo@ployo.io darf ausser ployo-demo keinen weiteren Tenant haben
    const ownerMemberships = await prisma.tenantMembership.findMany({ where: { userId: targetOwner.id }, select: { tenantId: true } });
    if (ownerMemberships.some((m) => m.tenantId !== oldTarget?.id)) throw new Error("demo@ployo.io ist Mitglied in einem weiteren Tenant – Abbruch.");
    const removeUsers = await prisma.user.findMany({ where: { email: { in: REMOVE_USER_EMAILS } }, select: { id: true, email: true, memberships: { select: { tenantId: true } } } });
    for (const u of removeUsers) {
      if (u.memberships.some((m) => m.tenantId !== oldTarget?.id)) throw new Error(`${u.email} gehört zu einem weiteren Tenant – Abbruch.`);
    }
    const pendingInvites = await prisma.tenantInvitation.count({ where: { tenantId: source.id } });
    if (pendingInvites) console.log(`[dup] Hinweis: ${pendingInvites} Einladung(en) im Quell-Tenant werden nicht kopiert.`);

    // --- Quellzeilen laden + ID-Mapping aufbauen
    const specs = tablesFor();
    const rowsByTable = new Map<string, Record<string, unknown>[]>();
    const idMap = new Map<string, string>();
    const newTenantId = cuid();
    idMap.set(source.id, newTenantId);
    idMap.set(sourceOwner.id, targetOwner.id);
    for (const spec of specs) {
      const rows = await prisma.$queryRawUnsafe<{ r: Record<string, unknown> }[]>(
        `select row_to_json(t) as r from ${q(spec.table)} t where ${spec.where}${spec.orderBy ? ` order by ${spec.orderBy}` : ""}`,
        source.id,
      );
      rowsByTable.set(spec.table, rows.map((x) => x.r));
      for (const { r } of rows) {
        if (typeof r.id === "string" && !idMap.has(r.id)) idMap.set(r.id, cuid());
      }
    }
    // Vollstaendigkeit: jede Tabelle mit tenantId muss abgedeckt sein
    const tenantTables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`);
    const covered = new Set([...specs.map((s) => s.table), ...SKIPPED_TENANT_TABLES]);
    const missing = tenantTables.map((t) => t.table_name).filter((t) => !covered.has(t));
    if (missing.length) throw new Error(`Nicht abgedeckte Tenant-Tabellen: ${missing.join(", ")}`);

    // --- Zeilen transformieren: jedes alphanumerische Token, das eine bekannte ID ist, ersetzen
    const remapText = (text: string) =>
      text.replace(/[A-Za-z0-9]+/g, (tok) => idMap.get(tok) ?? tok).split(SOURCE_OWNER_EMAIL).join(TARGET_OWNER_EMAIL);
    const transformed = new Map<string, Record<string, unknown>[]>();
    for (const spec of specs) {
      transformed.set(spec.table, rowsByTable.get(spec.table)!.map((row) => {
        const out = JSON.parse(remapText(JSON.stringify(row))) as Record<string, unknown>;
        if (spec.table === "TenantLocation") out.clockQrToken = out.clockQrToken ? generateClockQrToken() : null;
        return out;
      }));
    }
    const [{ r: sourceTenantRow }] = await prisma.$queryRawUnsafe<{ r: Record<string, unknown> }[]>(`select row_to_json(t) as r from "Tenant" t where id = $1`, source.id);
    const tenantRow = JSON.parse(remapText(JSON.stringify(sourceTenantRow))) as Record<string, unknown>;
    Object.assign(tenantRow, {
      id: newTenantId, slug: TARGET_SLUG, contactEmail: TARGET_OWNER_EMAIL,
      stripeCustomerId: null, stripeSubscriptionId: null, stripePriceId: null, stripeSubscriptionStatus: null,
      stripeCurrentPeriodEnd: null, stripeCancelAtPeriodEnd: false, stripeLastEventCreatedAt: null,
    });

    // Plausibilitaet: keine Quell-ID darf in den neuen Zeilen uebrig sein
    const leftover = [...transformed.values()].flat().map((r) => JSON.stringify(r)).join("\n");
    for (const oldId of [source.id, sourceOwner.id]) if (leftover.includes(oldId)) throw new Error(`Alte ID ${oldId} nach Remap noch vorhanden`);

    // --- Storage-Kopien vorbereiten (alle Datei-Zeilen, inkl. Papierkorb)
    const fileCopies = transformed.get("TenantFile")!.map((f, i) => ({
      bucket: String(f.bucket), from: String(rowsByTable.get("TenantFile")![i].storageKey), to: String(f.storageKey),
    }));
    if (!DRY_RUN) {
      const s3 = getStorageClient();
      console.log(`[dup] Kopiere ${fileCopies.length} Storage-Objekte …`);
      for (const c of fileCopies) {
        await s3.send(new CopyObjectCommand({
          Bucket: c.bucket, Key: c.to, CopySource: `${c.bucket}/${c.from.split("/").map(encodeURIComponent).join("/")}`,
          MetadataDirective: "COPY",
        }));
      }
    }

    // Alte Storage-Objekte merken (Loeschung nach Commit)
    const oldFiles = oldTarget ? await prisma.tenantFile.findMany({ where: { tenantId: oldTarget.id }, select: { bucket: true, storageKey: true } }) : [];

    // ================================================================ Transaktion
    const counts: Record<string, number> = {};
    try {
      await prisma.$transaction(async (tx) => {
        if (oldTarget) {
          const t = oldTarget.id;
          const addrIds = (await tx.$queryRawUnsafe<{ id: string }[]>(`select "companyAddressId" as id from "TenantSettings" where "tenantId"=$1 and "companyAddressId" is not null union select "addressId" from "TenantLocation" where "tenantId"=$1 and "addressId" is not null`, t)).map((x) => x.id);
          const empAddrIds = (await tx.$queryRawUnsafe<{ id: string }[]>(`select "privateAddressId" as id from "TenantEmployee" where "tenantId"=$1 and "privateAddressId" is not null union select "workAddressId" from "TenantEmployee" where "tenantId"=$1 and "workAddressId" is not null`, t)).map((x) => x.id);
          // RESTRICT-Verweise auf TenantFile zuerst entfernen, dann Cascade über den Tenant
          await tx.tenantEmployeeContract.deleteMany({ where: { tenantId: t } });
          await tx.tenantPayrollStatement.deleteMany({ where: { tenantId: t } });
          await tx.tenant.delete({ where: { id: t } });
          await tx.address.deleteMany({ where: { id: { in: addrIds } } });
          await tx.employeeAddress.deleteMany({ where: { id: { in: empAddrIds } } });
          counts.deletedOldTenantAddresses = addrIds.length + empAddrIds.length;
        }
        for (const u of removeUsers) await tx.user.delete({ where: { id: u.id } });
        counts.deletedUsers = removeUsers.length;

        await tx.$executeRawUnsafe(`insert into "Tenant" select * from json_populate_record(null::"Tenant", $1::json)`, JSON.stringify(tenantRow));
        for (const spec of specs) {
          const rows = transformed.get(spec.table)!;
          // in Bloecken einfuegen (json_populate_recordset)
          for (let i = 0; i < rows.length; i += 500) {
            await tx.$executeRawUnsafe(`insert into ${q(spec.table)} select * from json_populate_recordset(null::${q(spec.table)}, $1::json)`, JSON.stringify(rows.slice(i, i + 500)));
          }
          counts[spec.table] = rows.length;
        }

        // Gegenprobe: gleiche Zeilenzahl in Quelle und Ziel
        for (const spec of specs) {
          const [src] = await tx.$queryRawUnsafe<{ n: bigint }[]>(`select count(*) n from ${q(spec.table)} t where ${spec.where}`, source.id);
          const [dst] = await tx.$queryRawUnsafe<{ n: bigint }[]>(`select count(*) n from ${q(spec.table)} t where ${spec.where}`, newTenantId);
          if (src.n !== dst.n) throw new Error(`Zeilenzahl ${spec.table}: Quelle ${src.n}, Ziel ${dst.n}`);
        }
        const owner = await tx.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: newTenantId, userId: targetOwner.id } }, select: { role: true } });
        if (owner?.role !== "OWNER") throw new Error("demo@ployo.io ist nicht OWNER im neuen Tenant");

        if (DRY_RUN) throw new DryRunRollback();
      }, { timeout: 300_000, maxWait: 20_000 });
    } catch (error) {
      if (!(error instanceof DryRunRollback)) throw error;
      console.log("[dup] DRY-RUN: alles ausgeführt und zurückgerollt.");
    }
    console.log("[dup] Zeilen:", JSON.stringify(counts));

    // --- Alte Storage-Objekte löschen (nach Commit)
    if (!DRY_RUN && oldTarget) {
      const s3 = getStorageClient();
      const buckets = new Set(oldFiles.map((f) => f.bucket));
      let deleted = 0;
      for (const bucket of buckets) {
        let token: string | undefined;
        do {
          const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `tenants/${oldTarget.id}/`, ContinuationToken: token }));
          const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
          if (keys.length) { await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } })); deleted += keys.length; }
          token = page.IsTruncated ? page.NextContinuationToken : undefined;
        } while (token);
      }
      console.log(`[dup] ${deleted} Storage-Objekte des alten Tenants gelöscht.`);
    }
    console.log(`[dup] Fertig${DRY_RUN ? " (DRY-RUN)" : ""}. Neuer Tenant ${newTenantId} (${TARGET_SLUG}), alter Tenant ${oldTarget?.id ?? "–"} entfernt.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
