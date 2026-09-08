import { PrismaClient } from "@prisma/client";
import { buildRolePermissionCreateData, permissionRoles } from "../lib/roles";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/**
 * Bestandskorrektur für Audit-Finding C01 (Rest): `ensureTenantDefaultRoles`/
 * `upsertTenantSystemRoleByKey` bauen eine bereits VORHANDENE Systemrolle
 * über `update: {}` absichtlich nicht um — das ist richtig für Rollen, die
 * ein Admin nachträglich bewusst angepasst hat, repariert aber auch nie eine
 * Systemrolle, die vor diesem Fix mit dem unvollständigen alten Template
 * (Scope/Fähigkeiten auf dem Prisma-Feld-Default statt dem echten Template)
 * angelegt wurde.
 *
 * Dieses Skript vergleicht NUR `isSystem: true`-Rollen (nie frei angelegte
 * Kundenrollen) gegen das aktuelle kanonische Template
 * (`buildRolePermissionCreateData`) und repariert ausschließlich fehlende
 * oder abweichende Bereichszeilen. Dry-run per Default — Änderungen nur mit
 * `--apply`. Bewusst nicht automatisch verdrahtet (kein Hook/Cron): der
 * Auditbericht warnt ausdrücklich vor einer undifferenzierten Reparatur
 * produktiver Rollen ohne Kontrolle durch den Betreiber.
 */
async function main() {
  const templateByKey = new Map(permissionRoles.map((role) => [role.key, role]));

  const systemRoles = await prisma.tenantRole.findMany({
    where: { isSystem: true },
    select: {
      id: true,
      key: true,
      name: true,
      tenantId: true,
      tenant: { select: { slug: true } },
      permissions: true,
    },
  });

  console.log(`${systemRoles.length} Systemrollen gefunden.`);

  let rolesWithDrift = 0;
  let areasRepaired = 0;
  let rolesWithoutTemplate = 0;

  for (const role of systemRoles) {
    const template = templateByKey.get(role.key);

    if (!template) {
      // Ein Systemrollen-Key, den es im aktuellen Template nicht (mehr) gibt
      // — nichts, wogegen sich vergleichen ließe. Wird nicht angefasst.
      rolesWithoutTemplate += 1;
      continue;
    }

    const expectedRows = buildRolePermissionCreateData(template);
    const actualByArea = new Map(role.permissions.map((permission) => [permission.area, permission]));
    let roleHasDrift = false;

    for (const expected of expectedRows) {
      const actual = actualByArea.get(expected.area);
      const diverges =
        !actual ||
        actual.level !== expected.level ||
        actual.scope !== expected.scope ||
        actual.canDelete !== expected.canDelete ||
        actual.canUploadFiles !== expected.canUploadFiles ||
        actual.canEditFiles !== expected.canEditFiles ||
        actual.canViewFiles !== expected.canViewFiles ||
        actual.canViewAudit !== expected.canViewAudit ||
        (actual.shiftsLevel ?? null) !== (expected.shiftsLevel ?? null);

      if (!diverges) {
        continue;
      }

      roleHasDrift = true;
      areasRepaired += 1;
      console.log(
        `- Tenant ${role.tenant.slug} / Rolle "${role.name}" (${role.key}) / Bereich "${expected.area}": ` +
          `${actual ? `level=${actual.level} scope=${actual.scope}` : "FEHLT"} -> level=${expected.level} scope=${expected.scope}` +
          `${APPLY ? "" : " [dry-run]"}`,
      );

      if (APPLY) {
        await prisma.tenantRolePermission.upsert({
          where: { roleId_area: { roleId: role.id, area: expected.area } },
          create: { roleId: role.id, ...expected },
          update: expected,
        });
      }
    }

    if (roleHasDrift) {
      rolesWithDrift += 1;
    }
  }

  console.log(
    `\nZusammenfassung: ${rolesWithDrift} Rolle(n) mit Abweichung, ${areasRepaired} Bereichszeile(n) betroffen, ` +
      `${rolesWithoutTemplate} Systemrolle(n) ohne passendes aktuelles Template (unangetastet).`,
  );
  console.log(APPLY ? "Änderungen wurden angewendet." : "Dry-run — mit --apply erneut ausführen, um zu übernehmen.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
