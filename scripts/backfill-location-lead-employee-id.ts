import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/**
 * Best-effort-Backfill für `TenantLocation.leadEmployeeId`: für Standorte mit
 * gesetztem `leadName` (ungleich "Keine Leitung") aber ohne `leadEmployeeId`
 * wird versucht, per exaktem (case-insensitivem) Namensabgleich innerhalb des
 * Mandanten den passenden Mitarbeiter zu finden. Bei mehreren Treffern
 * (doppelte Namen) wird bewusst NICHT geraten — Standort bleibt unverändert,
 * muss manuell im Bearbeiten-Formular neu gesetzt werden.
 */
async function main() {
  const locations = await prisma.tenantLocation.findMany({
    where: {
      leadEmployeeId: null,
      leadName: { not: "Keine Leitung" },
      NOT: { leadName: "" },
    },
    select: { id: true, key: true, name: true, tenantId: true, leadName: true },
  });

  console.log(`${locations.length} Standort(e) mit Leitungsnamen ohne leadEmployeeId gefunden.`);

  let matched = 0;
  let ambiguous = 0;
  let noMatch = 0;

  for (const location of locations) {
    const candidates = await prisma.tenantEmployee.findMany({
      where: {
        tenantId: location.tenantId,
        name: { equals: location.leadName, mode: "insensitive" },
      },
      select: { id: true, name: true },
    });

    if (candidates.length === 0) {
      noMatch += 1;
      console.log(
        `- Standort "${location.name}" (${location.key}): kein Mitarbeiter mit Namen "${location.leadName}" gefunden — übersprungen.`,
      );
      continue;
    }

    if (candidates.length > 1) {
      ambiguous += 1;
      console.log(
        `- Standort "${location.name}" (${location.key}): ${candidates.length} Mitarbeiter mit Namen "${location.leadName}" gefunden (mehrdeutig) — übersprungen, bitte manuell setzen.`,
      );
      continue;
    }

    matched += 1;
    console.log(
      `- Standort "${location.name}" (${location.key}): eindeutiger Treffer -> ${candidates[0].name} (${candidates[0].id})${APPLY ? "" : " [dry-run]"}`,
    );

    if (APPLY) {
      await prisma.tenantLocation.update({
        where: { id: location.id },
        data: { leadEmployeeId: candidates[0].id },
      });
    }
  }

  console.log(
    `\nZusammenfassung: ${matched} eindeutig zuordenbar, ${ambiguous} mehrdeutig (übersprungen), ${noMatch} ohne Treffer (übersprungen).`,
  );
  console.log(APPLY ? "Änderungen wurden angewendet." : "Dry-run — mit --apply erneut ausführen, um zu übernehmen.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
