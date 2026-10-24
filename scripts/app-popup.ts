import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Popups der Mitarbeiter-App pflegen, bis es das Ployo-Admin-Dashboard gibt
 * (Modell `AppPopup`, Auslieferung über lib/app-popups.ts).
 *
 *   npx tsx scripts/app-popup.ts list
 *   npx tsx scripts/app-popup.ts create --title "…" --body "…" [--title-en "…"] [--body-en "…"]
 *       [--button "…"] [--button-en "…"] [--url https://… | /vacation] [--image https://…]
 *       [--priority 10] [--starts 2026-11-01T08:00] [--ends 2026-11-30] [--inactive]
 *   npx tsx scripts/app-popup.ts activate <id>
 *   npx tsx scripts/app-popup.ts deactivate <id>
 *   npx tsx scripts/app-popup.ts reset <id>     (alle "geschlossen"-Markierungen löschen → kommt wieder)
 *   npx tsx scripts/app-popup.ts delete <id>
 */

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);

  return index === -1 ? undefined : args[index + 1];
}

function optionalDate(value: string | undefined, name: string): Date | null {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`--${name}: ungültiges Datum "${value}".`);
  }

  return date;
}

function validButtonUrl(value: string | undefined): string | null {
  if (!value) return null;

  if (!/^https:\/\//.test(value) && !/^\/[A-Za-z0-9/_-]*$/.test(value)) {
    throw new Error('--url muss mit "https://" beginnen oder ein App-Pfad wie "/vacation" sein.');
  }

  return value;
}

async function list() {
  const popups = await prisma.appPopup.findMany({
    orderBy: [{ active: "desc" }, { priority: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { dismissals: true } } },
  });

  if (popups.length === 0) {
    console.log("Keine Popups.");
    return;
  }

  for (const popup of popups) {
    const window = [popup.startsAt?.toISOString() ?? "—", popup.endsAt?.toISOString() ?? "—"].join(" → ");
    console.log(
      `${popup.id}  ${popup.active ? "AKTIV " : "inaktiv"}  prio ${popup.priority}  ${window}  ` +
        `${popup._count.dismissals}× geschlossen\n    ${popup.title}`,
    );
  }
}

async function create(args: string[]) {
  const title = option(args, "title");
  const body = option(args, "body");

  if (!title || !body) {
    throw new Error("--title und --body sind Pflicht.");
  }

  const popup = await prisma.appPopup.create({
    data: {
      title,
      body,
      titleEn: option(args, "title-en") ?? null,
      bodyEn: option(args, "body-en") ?? null,
      buttonLabel: option(args, "button") ?? null,
      buttonLabelEn: option(args, "button-en") ?? null,
      buttonUrl: validButtonUrl(option(args, "url")),
      imageUrl: option(args, "image") ?? null,
      priority: Number(option(args, "priority") ?? 0) || 0,
      startsAt: optionalDate(option(args, "starts"), "starts"),
      endsAt: optionalDate(option(args, "ends"), "ends"),
      active: !args.includes("--inactive"),
    },
  });

  console.log(`Angelegt: ${popup.id}${popup.active ? "" : " (inaktiv)"}`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const id = args[0];

  switch (command) {
    case "list":
      return list();
    case "create":
      return create(args);
    case "activate":
    case "deactivate":
      await prisma.appPopup.update({ where: { id }, data: { active: command === "activate" } });
      return console.log(`${id}: ${command === "activate" ? "aktiv" : "inaktiv"}`);
    case "reset": {
      const { count } = await prisma.appPopupDismissal.deleteMany({ where: { popupId: id } });
      return console.log(`${id}: ${count} Markierungen gelöscht.`);
    }
    case "delete":
      await prisma.appPopup.delete({ where: { id } });
      return console.log(`${id}: gelöscht.`);
    default:
      throw new Error("Befehl: list | create | activate | deactivate | reset | delete (siehe Kopfkommentar).");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
