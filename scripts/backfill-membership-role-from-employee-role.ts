import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/**
 * Rückwirkende Anwendung von `syncMembershipRoleFromEmployeeRole` (siehe
 * lib/role-service.ts) auf Bestandsdaten: für alle verknüpften Mitarbeiter,
 * deren "Berechtigungsrolle"-Feld (TenantEmployee.role) exakt zu einer echten
 * Rolle im Mandanten passt, aber deren TenantMembership.roleId (noch) nicht
 * darauf zeigt, wird roleId jetzt gesetzt.
 */
async function main() {
  const employees = await prisma.tenantEmployee.findMany({
    where: { userId: { not: null }, NOT: { role: "" } },
    select: { id: true, name: true, role: true, userId: true, tenantId: true },
  });

  console.log(`${employees.length} verknüpfte Mitarbeiter mit gesetztem Rollenfeld gefunden.`);

  let updated = 0;
  let alreadyCorrect = 0;
  let noMatch = 0;

  for (const employee of employees) {
    const role = await prisma.tenantRole.findFirst({
      where: { tenantId: employee.tenantId, name: { equals: employee.role, mode: "insensitive" } },
      select: { id: true, name: true },
    });

    if (!role) {
      noMatch += 1;
      continue;
    }

    const membership = await prisma.tenantMembership.findFirst({
      where: { tenantId: employee.tenantId, userId: employee.userId! },
      select: { id: true, roleId: true },
    });

    if (!membership) {
      continue;
    }

    if (membership.roleId === role.id) {
      alreadyCorrect += 1;
      continue;
    }

    updated += 1;
    console.log(
      `- ${employee.name} (Rolle "${employee.role}") -> Mitgliedschaft roleId ${membership.roleId ?? "null"} -> ${role.id} (${role.name})${APPLY ? "" : " [dry-run]"}`,
    );

    if (APPLY) {
      await prisma.tenantMembership.update({
        where: { id: membership.id },
        data: { roleId: role.id },
      });
    }
  }

  console.log(
    `\nZusammenfassung: ${updated} aktualisiert, ${alreadyCorrect} bereits korrekt, ${noMatch} ohne passende Rolle (Jobtitel, keine echte Rolle).`,
  );
  console.log(APPLY ? "Änderungen wurden angewendet." : "Dry-run — mit --apply erneut ausführen, um zu übernehmen.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
