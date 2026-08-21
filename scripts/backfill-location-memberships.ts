import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

async function main() {
  const employees = await prisma.tenantEmployee.findMany({
    where: { location: { not: "" } },
    select: { id: true, tenantId: true, location: true, initials: true, name: true },
  });

  console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${employees.length} employees with a location string set.`);

  let created = 0;
  let alreadyMember = 0;
  let unknownLocation = 0;
  const affectedLocationIds = new Set<string>();
  const unknownDetails: string[] = [];

  for (const employee of employees) {
    const location = await prisma.tenantLocation.findFirst({
      where: { tenantId: employee.tenantId, name: employee.location },
      select: { id: true, name: true },
    });

    if (!location) {
      unknownLocation += 1;
      unknownDetails.push(`${employee.name} -> "${employee.location}" (tenant ${employee.tenantId})`);
      continue;
    }

    const existing = await prisma.tenantLocationMember.findUnique({
      where: { locationId_employeeId: { locationId: location.id, employeeId: employee.id } },
    });

    if (existing) {
      alreadyMember += 1;
      continue;
    }

    created += 1;
    affectedLocationIds.add(location.id);

    if (APPLY) {
      await prisma.tenantLocationMember.create({
        data: {
          locationId: location.id,
          employeeId: employee.id,
          initials: employee.initials,
          name: employee.name,
        },
      });
    }
  }

  if (APPLY) {
    for (const locationId of affectedLocationIds) {
      const count = await prisma.tenantLocationMember.count({ where: { locationId } });
      await prisma.tenantLocation.update({ where: { id: locationId }, data: { employeeCount: count } });
    }
  }

  console.log({
    created,
    alreadyMember,
    unknownLocation,
    affectedLocations: affectedLocationIds.size,
  });

  if (unknownDetails.length) {
    console.log("Unknown location names (no matching TenantLocation, skipped):");
    for (const detail of unknownDetails) console.log(`  - ${detail}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
