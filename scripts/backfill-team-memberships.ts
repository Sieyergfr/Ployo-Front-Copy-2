import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

/**
 * Backfill für QA-Bug BUG-003: vor commit ddd03bb8 landete eine über das
 * Mitarbeiterprofil gesetzte Team-Zuordnung nur in der Freitext-Spalte
 * `TenantEmployee.team`, nie im echten Team-Roster (`TenantTeamMember`).
 * Dieses Skript gleicht bereits bestehende Datensätze einmalig nach, exakt
 * nach dem Muster von backfill-location-memberships.ts.
 */
async function main() {
  const employees = await prisma.tenantEmployee.findMany({
    where: { team: { not: "" } },
    select: {
      id: true,
      tenantId: true,
      team: true,
      initials: true,
      name: true,
      location: true,
      role: true,
      contract: true,
      status: true,
    },
  });

  console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${employees.length} employees with a team string set.`);

  let created = 0;
  let alreadyMember = 0;
  let unknownTeam = 0;
  const affectedTeamIds = new Set<string>();
  const unknownDetails: string[] = [];

  for (const employee of employees) {
    const team = await prisma.tenantTeam.findFirst({
      where: { tenantId: employee.tenantId, name: employee.team },
      select: { id: true, name: true },
    });

    if (!team) {
      unknownTeam += 1;
      unknownDetails.push(`${employee.name} -> "${employee.team}" (tenant ${employee.tenantId})`);
      continue;
    }

    const existing = await prisma.tenantTeamMember.findUnique({
      where: { teamId_employeeId: { teamId: team.id, employeeId: employee.id } },
    });

    if (existing) {
      alreadyMember += 1;
      continue;
    }

    created += 1;
    affectedTeamIds.add(team.id);

    if (APPLY) {
      await prisma.tenantTeamMember.create({
        data: {
          teamId: team.id,
          employeeId: employee.id,
          initials: employee.initials,
          name: employee.name,
          location: employee.location,
          role: employee.role,
          contract: employee.contract,
          status: employee.status === "vacation" ? "vacation" : "on-duty",
        },
      });
    }
  }

  console.log({
    created,
    alreadyMember,
    unknownTeam,
    affectedTeams: affectedTeamIds.size,
  });

  if (unknownDetails.length) {
    console.log("Unknown team names (no matching TenantTeam, skipped):");
    for (const detail of unknownDetails) console.log(`  - ${detail}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
