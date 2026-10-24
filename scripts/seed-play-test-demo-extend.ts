/**
 * Erweitert den bestehenden Demo-Betrieb "Ployo Demo Gastro GmbH"
 * (scripts/seed-play-test-demo.ts) um 5 weitere Mitarbeiter mit Login
 * (MA-0021 … MA-0025): Konto, Mitgliedschaft, Personalakte, Vertrag +
 * Lohnabrechnung (PDF), Team/Standort, Schichten in den vorhandenen Wochen
 * (veroeffentlichte Wochen-Snapshots werden ergaenzt), Zeiteintraege fuer
 * vergangene Schichten und je ein eigenes Testszenario.
 *
 * REIN ADDITIV: loescht nichts. Bricht ab, wenn eine der 5 E-Mails oder
 * Personalnummern schon existiert. Alle DB-Schreibvorgaenge in EINER
 * Transaktion. --dry-run fuehrt alles aus und rollt am Ende zurueck
 * (impliziert --skip-uploads).
 *
 * Aufruf (server-only-Stub + .env):
 *   NODE_OPTIONS="--require <stub-server-only.cjs> --require dotenv/config" \
 *     npx tsx scripts/seed-play-test-demo-extend.ts --out <credentials.json> [--dry-run] [--skip-uploads]
 */
import { randomBytes, randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";
import { PrismaClient, Prisma, type Weekday } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { encryptField } from "../lib/encryption";
import { encryptAddress } from "../lib/employee-address";
import { normalizeAddressInput } from "../lib/address";
import { calculateVacationWorkDays } from "../lib/vacations";
import { requiredBreakMinutes, findRestPeriodViolation } from "../lib/arbzg-rules";
import { renderNotification, type NotificationMessage } from "../lib/notifications/messages";
import { buildStorageKey, getFileExtension } from "../lib/storage/key-builder";
import { uploadObject } from "../lib/storage/upload";
import { getStorageBucket } from "../lib/storage/buckets";

const args = process.argv.slice(2);
const OUT = args[args.indexOf("--out") + 1];
const DRY_RUN = args.includes("--dry-run");
const SKIP_UPLOADS = DRY_RUN || args.includes("--skip-uploads");
if (!args.includes("--out") || !OUT) throw new Error("--out <datei.json> fehlt");

const TENANT_SLUG = "ployo-demo-gastro";
const TENANT_NAME = "Ployo Demo Gastro GmbH";
const BUNDESLAND = "BY" as const;
const FIRST_INDEX = 20; // MA-0021

// ---------------------------------------------------------------- Helfer (wie seed-play-test-demo.ts)

const cuid = () => "c" + randomBytes(12).toString("hex").slice(0, 24);
const pad2 = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const parseIso = (s: string) => new Date(`${s}T00:00:00Z`);
const addDaysIso = (s: string, n: number) => { const d = parseIso(s); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); };
const WD: Weekday[] = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const fmtDe = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;

function isoWeek(s: string) {
  const d = parseIso(s);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7) };
}
const mondayOf = (s: string) => addDaysIso(s, -((parseIso(s).getUTCDay() + 6) % 7));
function mondayOfIsoWeek(year: number, week: number) {
  const jan4 = `${year}-01-04`;
  return addDaysIso(mondayOf(jan4), (week - 1) * 7);
}

function berlin(dateIso: string, hhmm: string): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let guess = wall - 3600_000;
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    guess = wall - (asUtc - guess);
  }
  return new Date(guess);
}
const minutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

const PW_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const pwGroup = () => Array.from({ length: 4 }, () => PW_ALPHABET[randomInt(PW_ALPHABET.length)]).join("");
const makePassword = () => `Ployo-${pwGroup()}-${pwGroup()}`;
const euro = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

// ---------------------------------------------------------------- Stammdaten

type LocKey = "altstadt" | "schwabing" | "verwaltung";
type TeamKey = "kueche" | "service" | "cafe" | "verwaltung";
type ShiftDef = { start: string; end: string; brk: number; label: string };

const LOCATIONS: Record<LocKey, { name: string; accent: string; street: string; no: string; zip: string }> = {
  altstadt: { name: "Restaurant Altstadt", accent: "bg-[#C9622A]", street: "Beispielgasse", no: "7", zip: "80331" },
  schwabing: { name: "Café Schwabing", accent: "bg-[#8B6ED4]", street: "Musterallee", no: "24", zip: "80799" },
  verwaltung: { name: "Verwaltung München", accent: "bg-[#5C6B7A]", street: "Beispielstraße", no: "12", zip: "80335" },
};
const TEAM_NAMES: Record<TeamKey, string> = { kueche: "Küche", service: "Service", cafe: "Café & Bar", verwaltung: "Verwaltung" };
const TEAM_LEAD: Record<TeamKey, string> = { kueche: "Markus Schuster", service: "Elena Richter", cafe: "Can Yilmaz", verwaltung: "David Demo" };

const SHIFTS = {
  kF: { start: "09:00", end: "17:00", brk: 30, label: "Küche Früh" },
  kS: { start: "15:00", end: "23:00", brk: 30, label: "Küche Spät" },
  sF: { start: "10:30", end: "18:00", brk: 30, label: "Service Früh" },
  sS: { start: "15:30", end: "23:30", brk: 30, label: "Service Spät" },
  cF: { start: "07:00", end: "14:30", brk: 30, label: "Café Früh" },
  cS: { start: "12:00", end: "19:30", brk: 30, label: "Café Spät" },
} satisfies Record<string, ShiftDef>;

type Pattern =
  | { kind: "fixed"; shift: ShiftDef }
  | { kind: "rotate"; early: ShiftDef; late: ShiftDef; offset: 0 | 1 };

type Person = {
  first: string; last: string; emailLocal: string; gender: "m" | "w";
  position: string; team: TeamKey; locs: LocKey[]; roleKey: "employee";
  contract: "Unbefristet" | "Teilzeit" | "Befristet";
  contractType: "Arbeitsvertrag" | "Teilzeitvertrag" | "Befristeter Arbeitsvertrag";
  hours: number; days: Weekday[]; pattern: Pattern;
  /** Standort je Wochentag (sonst locs[0]). */
  locByDay?: Partial<Record<Weekday, LocKey>>;
  start: string; birth: string; birthPlace: string; nationality: string; marital: string;
  street: string; no: string; zip: string; city: string; insurance: string;
  pay: { monthly: number }; vacation: number; endDate?: string;
  tester: string;
};

const P: Person[] = [
  { first: "Hannah", last: "Vogel", emailLocal: "vogel", gender: "w", position: "Servicekraft", team: "service", locs: ["altstadt"], roleKey: "employee", contract: "Unbefristet", contractType: "Arbeitsvertrag", hours: 38, days: ["Di", "Mi", "Do", "Fr", "Sa"], pattern: { kind: "rotate", early: SHIFTS.sF, late: SHIFTS.sS, offset: 0 }, start: "2026-10-01", birth: "1999-07-21", birthPlace: "Starnberg", nationality: "deutsch", marital: "ledig", street: "Herzogstraße", no: "52", zip: "80803", city: "München", insurance: "Barmer", pay: { monthly: 2750 }, vacation: 30,
    tester: "Ganz neu im Team (Eintritt 01.10.2026, Probezeit bis 31.03.2027) – erst ab Oktober im Schichtplan. Offene Info-Anfrage: Nachweis Belehrung § 43 IfSG hochladen." },
  { first: "Kevin", last: "Scholz", emailLocal: "scholz", gender: "m", position: "Koch", team: "kueche", locs: ["altstadt"], roleKey: "employee", contract: "Unbefristet", contractType: "Arbeitsvertrag", hours: 38, days: ["Mi", "Do", "Fr", "Sa", "So"], pattern: { kind: "rotate", early: SHIFTS.kF, late: SHIFTS.kS, offset: 0 }, start: "2024-06-01", birth: "1990-11-11", birthPlace: "Traunstein", nationality: "deutsch", marital: "verheiratet", street: "Schleißheimer Straße", no: "88", zip: "80797", city: "München", insurance: "AOK Bayern", pay: { monthly: 3100 }, vacation: 30,
    tester: "Koch. Offener Urlaubsantrag über Weihnachten (22.–27.12.) – gut zum Genehmigen/Ablehnen durch Küchenchef oder Admin." },
  { first: "Lea", last: "Fischer", emailLocal: "fischer", gender: "w", position: "Barista", team: "cafe", locs: ["schwabing"], roleKey: "employee", contract: "Teilzeit", contractType: "Teilzeitvertrag", hours: 28, days: ["Do", "Fr", "Sa", "So"], pattern: { kind: "rotate", early: SHIFTS.cF, late: SHIFTS.cS, offset: 1 }, start: "2024-09-15", birth: "2000-03-08", birthPlace: "Lindau", nationality: "deutsch", marital: "ledig", street: "Agnesstraße", no: "31", zip: "80798", city: "München", insurance: "Techniker Krankenkasse", pay: { monthly: 1950 }, vacation: 24,
    tester: "Teilzeit-Barista (4-Tage-Woche Do–So). Genehmigter Urlaub 29.10.–01.11. (KW 44) – dort keine Schichten." },
  { first: "Jan", last: "Weber", emailLocal: "weber", gender: "m", position: "Haustechniker", team: "verwaltung", locs: ["verwaltung", "altstadt", "schwabing"], roleKey: "employee", contract: "Teilzeit", contractType: "Teilzeitvertrag", hours: 20, days: ["Mo", "Di", "Mi", "Do", "Fr"], pattern: { kind: "fixed", shift: { start: "08:00", end: "12:00", brk: 0, label: "Haustechnik" } }, locByDay: { Mo: "verwaltung", Di: "altstadt", Mi: "schwabing", Do: "altstadt", Fr: "verwaltung" }, start: "2021-10-01", birth: "1968-04-02", birthPlace: "Dachau", nationality: "deutsch", marital: "verheiratet", street: "Pippinger Straße", no: "105", zip: "81245", city: "München", insurance: "DAK-Gesundheit", pay: { monthly: 1700 }, vacation: 25,
    tester: "Haustechnik, arbeitet an allen drei Standorten (Standort wechselt je Wochentag, vormittags). War Anfang Oktober krank (abgeschlossen, AU liegt vor)." },
  { first: "Sarah", last: "Kaiser", emailLocal: "kaiser", gender: "w", position: "Auszubildende Restaurantfachfrau (1. Lehrjahr)", team: "service", locs: ["altstadt"], roleKey: "employee", contract: "Befristet", contractType: "Befristeter Arbeitsvertrag", hours: 38, days: ["Di", "Mi", "Do", "Fr", "Sa"], pattern: { kind: "fixed", shift: SHIFTS.sF }, start: "2026-09-01", endDate: "2029-08-31", birth: "2007-02-14", birthPlace: "Weilheim", nationality: "deutsch", marital: "ledig", street: "Am Anger", no: "3", zip: "82362", city: "Weilheim", insurance: "AOK Bayern", pay: { monthly: 1000 }, vacation: 27,
    tester: "Auszubildende (1. Lehrjahr, befristeter Vertrag, immer Frühschicht). Offener Wunschfrei-Antrag für 06.11. (Berufsschule)." },
];
if (P.length !== 5) throw new Error(`Erwartet 5 Personen, sind ${P.length}`);

const VACATIONS = [
  { who: "scholz", start: "2026-12-22", end: "2026-12-27", status: "pending" as const, note: "Weihnachten bei der Familie in Traunstein" },
  { who: "fischer", start: "2026-10-29", end: "2026-11-01", status: "approved" as const, note: "Kurzurlaub", decidedBy: "Can Yilmaz" },
];
const SICKNESS = [{ who: "weber", start: "2026-10-01", end: "2026-10-02", note: "Rückenschmerzen, AU liegt vor." }];
const WISHES = [{ who: "kaiser", date: "2026-11-06", reason: "Berufsschule – Leistungsnachweis" }];

async function makePdf(title: string, lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor(TENANT_NAME);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  let y = 790;
  page.drawText(TENANT_NAME, { x: 50, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 30;
  page.drawText(title, { x: 50, y, size: 18, font: bold });
  y -= 30;
  for (const line of lines) {
    const isHeading = line.startsWith("# ");
    page.drawText(isHeading ? line.slice(2) : line, { x: 50, y, size: isHeading ? 12 : 10, font: isHeading ? bold : font });
    y -= isHeading ? 20 : 15;
  }
  page.drawText("DEMO-DOKUMENT – fiktive Daten für Testzwecke", { x: 50, y: 30, size: 8, font, color: rgb(0.6, 0.2, 0.2) });
  return Buffer.from(await doc.save());
}

const maxKeyNumber = (keys: string[], prefix: string) => keys.reduce((m, k) => (k.startsWith(prefix) ? Math.max(m, Number(k.slice(prefix.length)) || 0) : m), 0);

class DryRunRollback extends Error {}

// ---------------------------------------------------------------- Main

async function main() {
  const prisma = new PrismaClient();
  try {
    if (!process.env.FIELD_ENCRYPTION_KEY) throw new Error("FIELD_ENCRYPTION_KEY nicht geladen – Abbruch (sonst Dev-Schlüssel!).");
    const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG }, select: { id: true } });
    if (!tenant) throw new Error(`Tenant ${TENANT_SLUG} nicht gefunden – Abbruch.`);
    const tenantId = tenant.id;

    const emails = P.map((p) => `${p.emailLocal}.test@ployo.io`);
    const numbers = P.map((_, i) => `MA-${String(FIRST_INDEX + i + 1).padStart(4, "0")}`);
    const existingUsers = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } });
    if (existingUsers.length) throw new Error(`E-Mails existieren bereits: ${existingUsers.map((u) => u.email).join(", ")} – Abbruch.`);
    const existingNumbers = await prisma.tenantEmployee.findMany({ where: { tenantId, employeeNumber: { in: numbers } }, select: { employeeNumber: true } });
    if (existingNumbers.length) throw new Error(`Personalnummern existieren bereits: ${existingNumbers.map((e) => e.employeeNumber).join(", ")} – Abbruch.`);

    // --- Bestehende Strukturen laden
    const [roles, locs, teams, staff, weekRows, shiftKeys, vacKeys, wishKeys, remKeys] = await Promise.all([
      prisma.tenantRole.findMany({ where: { tenantId }, select: { id: true, key: true, name: true } }),
      prisma.tenantLocation.findMany({ where: { tenantId }, select: { id: true, key: true } }),
      prisma.tenantTeam.findMany({ where: { tenantId }, select: { id: true, key: true } }),
      prisma.tenantEmployee.findMany({ where: { tenantId }, select: { userId: true, name: true, email: true } }),
      prisma.tenantShiftWeek.findMany({ where: { tenantId }, select: { id: true, year: true, week: true, status: true, publishedAt: true, employeeShiftCountsJson: true, publishedShiftsJson: true } }),
      prisma.tenantShift.findMany({ where: { tenantId }, select: { key: true, date: true } }),
      prisma.tenantVacationRequest.findMany({ where: { tenantId }, select: { key: true } }),
      prisma.tenantWishFreeRequest.findMany({ where: { tenantId }, select: { key: true } }),
      prisma.tenantReminder.findMany({ where: { tenantId }, select: { key: true } }),
    ]);
    const roleOf = (key: string) => { const r = roles.find((x) => x.key === key); if (!r) throw new Error(`Rolle ${key} fehlt`); return r; };
    const locId = Object.fromEntries(locs.map((l) => [l.key, l.id])) as Record<LocKey, string>;
    const teamId = Object.fromEntries(teams.map((t) => [t.key, t.id])) as Record<TeamKey, string>;
    for (const k of Object.keys(LOCATIONS)) if (!locId[k as LocKey]) throw new Error(`Standort ${k} fehlt`);
    for (const k of Object.keys(TEAM_NAMES)) if (!teamId[k as TeamKey]) throw new Error(`Team ${k} fehlt`);
    const staffByEmail = (local: string) => { const s = staff.find((x) => x.email === `${local}.test@ployo.io`); if (!s?.userId) throw new Error(`${local} fehlt`); return { id: s.userId, name: s.name }; };
    const hr = staffByEmail("krueger");
    const payrollPerson = staffByEmail("brandt");

    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
    const now = new Date();
    const currentMonday = mondayOf(today);
    const allDates = shiftKeys.map((s) => s.date).sort();
    const firstMonday = mondayOf(allDates[0]);
    const lastMonday = mondayOf(allDates[allDates.length - 1]);
    const weekMondays: string[] = [];
    for (let m = firstMonday; m <= lastMonday; m = addDaysIso(m, 7)) weekMondays.push(m);
    const publishedWeeks = weekRows.filter((w) => w.status === "published");
    const pastLimitMonday = currentMonday; // Zeiteinträge nur bis einschließlich laufender Woche

    const people = P.map((p, k) => {
      const i = FIRST_INDEX + k;
      return {
        ...p, i,
        name: `${p.first} ${p.last}`,
        initials: `${p.first[0]}${p.last[0]}`.toUpperCase(),
        email: `${p.emailLocal}.test@ployo.io`,
        userId: cuid(), employeeId: cuid(),
        key: `${p.first}-${p.last}`.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9-]/g, ""),
        number: numbers[k],
        password: makePassword(),
      };
    });
    const who = (local: string) => { const p = people.find((x) => x.emailLocal === local); if (!p) throw new Error(local); return p; };

    // --- Abwesenheiten blocken
    const blocked = new Map<string, Set<string>>();
    const block = (local: string, start: string, end: string) => {
      const set = blocked.get(local) ?? new Set<string>();
      for (let d = start; d <= end; d = addDaysIso(d, 1)) set.add(d);
      blocked.set(local, set);
    };
    VACATIONS.filter((v) => v.status === "approved").forEach((v) => block(v.who, v.start, v.end));
    SICKNESS.forEach((s) => block(s.who, s.start, s.end));

    // --- Schichten
    let shiftCounter = maxKeyNumber(shiftKeys.map((s) => s.key), "shift-");
    type ShiftRow = { id: string; key: string; date: string; weekday: Weekday; startTime: string; endTime: string; breakMinutes: number; team: string; note: string; employeeId: string; locationId: string; personLocal: string; locKey: LocKey };
    const shifts: ShiftRow[] = [];
    for (const monday of weekMondays) {
      const { week } = isoWeek(monday);
      for (let d = 0; d < 7; d++) {
        const date = addDaysIso(monday, d);
        const weekday = WD[d];
        for (const p of people) {
          if (!p.days.includes(weekday) || date < p.start) continue;
          if (blocked.get(p.emailLocal)?.has(date)) continue;
          const def = p.pattern.kind === "fixed" ? p.pattern.shift : (week + p.pattern.offset) % 2 === 0 ? p.pattern.early : p.pattern.late;
          const locKey = p.locByDay?.[weekday] ?? p.locs[0];
          shifts.push({ id: cuid(), key: `shift-${++shiftCounter}`, date, weekday, startTime: def.start, endTime: def.end, breakMinutes: def.brk, team: TEAM_NAMES[p.team], note: def.label, employeeId: p.employeeId, locationId: locId[locKey], personLocal: p.emailLocal, locKey });
        }
      }
    }

    // --- ArbZG-Selbstprüfung
    const spanMin = (s: { startTime: string; endTime: string }) => { const [a, b] = s.startTime.split(":").map(Number); const [c, d] = s.endTime.split(":").map(Number); return c * 60 + d - (a * 60 + b); };
    for (const s of shifts) {
      if (s.breakMinutes < requiredBreakMinutes(spanMin(s), false)) throw new Error(`Pause zu kurz: ${s.personLocal} ${s.date}`);
      if ((spanMin(s) - s.breakMinutes) / 60 > 10) throw new Error(`> 10h: ${s.personLocal} ${s.date}`);
    }
    for (const p of people) {
      const mine = shifts.filter((s) => s.employeeId === p.employeeId).sort((a, b) => a.date.localeCompare(b.date));
      for (let k = 0; k < mine.length; k++) {
        const others = mine.filter((_, j) => j !== k).map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime }));
        const v = findRestPeriodViolation(others, { date: mine[k].date, startTime: mine[k].startTime, endTime: mine[k].endTime }, 11);
        if (v) throw new Error(`Ruhezeit verletzt: ${p.name} ${mine[k].date} ${JSON.stringify(v)}`);
      }
    }

    // --- Dateien (Upload vor der Transaktion)
    const bucketConfig = getStorageBucket("hrDocuments");
    type FileRow = Prisma.TenantFileCreateManyInput & { id: string };
    const files: FileRow[] = [];
    async function storeFile(input: { name: string; body: Buffer; ownerId: string; folderSlug: string; folderName: string; documentType: string; description: string; validFrom?: string; expiresAt?: string; tags: string[]; assignedEmployee: { id: string; name: string }; uploadedBy: { id: string; name: string } }) {
      const id = cuid();
      const storageKey = buildStorageKey(bucketConfig, { tenantId, fileName: input.name, ownerType: "employee", ownerId: input.ownerId });
      let provider = "s3";
      if (!SKIP_UPLOADS) {
        const uploaded = await uploadObject({ key: storageKey, body: input.body, contentType: "application/pdf", metadata: { tenantId, originalName: encodeURIComponent(input.name) } });
        provider = uploaded.provider;
      }
      files.push({
        id, tenantId, employeeId: input.ownerId, bucket: bucketConfig.bucket, storageKey,
        originalName: input.name, displayName: input.name, mimeType: "application/pdf", sizeBytes: input.body.byteLength, extension: getFileExtension(input.name),
        folderSlug: input.folderSlug, folderName: input.folderName, ownerName: "HR", uploadedById: input.uploadedBy.id, uploadedByName: input.uploadedBy.name,
        documentType: input.documentType, validFrom: input.validFrom ?? "", expiresAt: input.expiresAt ?? "", description: input.description, tagsJson: input.tags,
        assignedEmployeeId: input.assignedEmployee.id, assignedEmployeeName: input.assignedEmployee.name, provider,
      });
      return id;
    }

    console.log(`[extend] Erzeuge + lade PDFs hoch${SKIP_UPLOADS ? " (übersprungen)" : ""} …`);
    const contractFileIds = new Map<string, string>();
    const payrollFileIds = new Map<string, { id: string; gross: string; net: string }>();
    const compensationText = (p: (typeof people)[number]) => `${euro(p.pay.monthly)} brutto / Monat`;
    for (const p of people) {
      const supervisor = TEAM_LEAD[p.team];
      const contractName = `Arbeitsvertrag ${p.name}.pdf`;
      contractFileIds.set(p.emailLocal, await storeFile({
        name: contractName,
        body: await makePdf(`Arbeitsvertrag – ${p.name}`, [
          `Zwischen ${TENANT_NAME}, Beispielstraße 12, 80335 München (Arbeitgeber)`, `und ${p.name} (Arbeitnehmer/in) wird folgender Vertrag geschlossen:`,
          "# § 1 Tätigkeit", `Position: ${p.position}`, `Arbeitsort: ${p.locs.map((l) => LOCATIONS[l].name).join(", ")}`, `Vorgesetzte/r: ${supervisor}`,
          "# § 2 Beginn und Dauer", `Beginn: ${fmtDe(p.start)}`, p.endDate ? `Befristet bis: ${fmtDe(p.endDate)}` : "Das Arbeitsverhältnis ist unbefristet.", "Probezeit: 6 Monate",
          "# § 3 Arbeitszeit", `${p.hours} Stunden pro Woche, Verteilung gemäß Schichtplan (${p.days.join(", ")}).`,
          "# § 4 Vergütung", compensationText(p),
          "# § 5 Urlaub", `${p.vacation} Arbeitstage pro Kalenderjahr.`,
          "# § 6 Kündigung", "Gesetzliche Kündigungsfristen (§ 622 BGB).",
        ]),
        ownerId: p.employeeId, folderSlug: "vertraege-vereinbarungen", folderName: "Verträge & Vereinbarungen", documentType: p.contractType, description: `Arbeitsvertrag ab ${fmtDe(p.start)}`,
        validFrom: p.start, expiresAt: p.endDate, tags: ["Vertrag"], assignedEmployee: { id: p.employeeId, name: p.name }, uploadedBy: hr,
      }));
      // Hannah Vogel ist erst seit Oktober dabei -> keine September-Abrechnung
      if (p.start > "2026-09-30") continue;
      const gross = p.pay.monthly;
      const net = Math.round(gross * 0.66 * 100) / 100;
      payrollFileIds.set(p.emailLocal, {
        id: await storeFile({
          name: `Gehaltsabrechnung 2026-09 ${p.name}.pdf`,
          body: await makePdf(`Entgeltabrechnung September 2026 – ${p.name}`, [`Personalnummer: ${p.number}`, `Position: ${p.position}`, "# Bezüge", `Bruttoentgelt: ${euro(gross)}`, "# Abzüge", `Steuern und Sozialversicherung: ${euro(Math.round((gross - net) * 100) / 100)}`, "# Auszahlung", `Nettoentgelt: ${euro(net)}`]),
          ownerId: p.employeeId, folderSlug: "abrechnungen", folderName: "Abrechnungen", documentType: "Gehaltsabrechnung", description: "September 2026",
          tags: ["Abrechnung"], assignedEmployee: { id: p.employeeId, name: p.name }, uploadedBy: payrollPerson,
        }),
        gross: euro(gross), net: euro(net),
      });
    }

    console.log("[extend] Hashe Passwörter …");
    const hashes = new Map<string, string>();
    for (const p of people) hashes.set(p.emailLocal, await hashPassword(p.password));

    // --- Benachrichtigungen
    const notifications: Prisma.TenantEmployeeNotificationCreateManyInput[] = [];
    const notify = (p: (typeof people)[number], category: string, message: NotificationMessage, entityType: string, entityId: string, createdAt: Date, read: boolean) => {
      const r = renderNotification(message, "de");
      notifications.push({ tenantId, userId: p.userId, category, title: r.subject, detail: r.text, read, readAt: read ? minutes(createdAt, 90) : null, createdAt, entityType, entityId, messagePayload: message as unknown as Prisma.InputJsonValue });
    };

    // --- Zeiteinträge für vergangene Schichten
    type EntryRow = { id: string; employeeId: string; clockInAt: Date; clockOutAt: Date; shiftId: string; plannedStartAt: Date; plannedEndAt: Date; shiftLocation: string; clockInLocationId: string | null; clockInLocationName: string; source: string; breaks: Array<{ startAt: Date; endAt: Date }> };
    const entries: EntryRow[] = [];
    for (const s of shifts) {
      if (s.date > addDaysIso(pastLimitMonday, 6) || berlin(s.date, s.endTime) >= now) continue;
      const plannedStart = berlin(s.date, s.startTime);
      const plannedEnd = berlin(s.date, s.endTime);
      const breaks: EntryRow["breaks"] = [];
      if (s.breakMinutes > 0 && randomInt(10) > 0) {
        const mid = minutes(plannedStart, Math.floor(spanMin(s) / 2) - 15 + randomInt(-20, 20));
        breaks.push({ startAt: mid, endAt: minutes(mid, s.breakMinutes + randomInt(0, 6)) });
      }
      const source = s.locKey === "verwaltung" ? "web" : "app";
      entries.push({ id: cuid(), employeeId: s.employeeId, clockInAt: minutes(plannedStart, randomInt(-9, 4)), clockOutAt: minutes(plannedEnd, randomInt(-3, 14)), shiftId: s.id, plannedStartAt: plannedStart, plannedEndAt: plannedEnd, shiftLocation: LOCATIONS[s.locKey].name, clockInLocationId: source === "app" ? s.locationId : null, clockInLocationName: source === "app" ? LOCATIONS[s.locKey].name : "", source, breaks });
    }

    // ================================================================ Transaktion
    console.log(`[extend] Schreibe in die Datenbank (eine Transaktion${DRY_RUN ? ", DRY-RUN mit Rollback" : ""}) …`);
    try {
      await prisma.$transaction(async (tx) => {
        for (const p of people) {
          await tx.user.create({ data: { id: p.userId, email: p.email, name: p.name, emailVerified: true } });
          await tx.account.create({ data: { userId: p.userId, accountId: p.userId, providerId: "credential", password: hashes.get(p.emailLocal)! } });
          await tx.userPreference.create({ data: { userId: p.userId } });
          await tx.tenantMembership.create({ data: { tenantId, userId: p.userId, role: "EMPLOYEE", roleId: roleOf(p.roleKey).id } });
        }

        // Personalakten
        for (const p of people) {
          const tenureYears = 2026 - Number(p.start.slice(0, 4));
          await tx.tenantEmployee.create({
            data: {
              id: p.employeeId, tenant: { connect: { id: tenantId } }, key: p.key, user: { connect: { id: p.userId } }, initials: p.initials, name: p.name, employeeNumber: p.number,
              birthDate: encryptField(p.birth), birthPlace: encryptField(p.birthPlace), nationality: encryptField(p.nationality), maritalStatus: encryptField(p.marital),
              privateAddress: { create: encryptAddress(normalizeAddressInput({ street: p.street, houseNumber: p.no, postalCode: p.zip, city: p.city, country: "DE" })) },
              workAddress: { create: encryptAddress(normalizeAddressInput({ street: LOCATIONS[p.locs[0]].street, houseNumber: LOCATIONS[p.locs[0]].no, postalCode: LOCATIONS[p.locs[0]].zip, city: "München", country: "DE" })) },
              taxId: encryptField(`${1 + (p.i % 9)}${String(4718293056 + p.i * 7919).slice(0, 10)}`),
              socialSecurityNumber: encryptField(`${String(10 + p.i).slice(-2)} ${p.birth.slice(8, 10)}${p.birth.slice(5, 7)}${p.birth.slice(2, 4)} ${p.last[0].toUpperCase()} ${String(100 + p.i * 3).slice(-3)}`),
              healthInsurance: encryptField(p.insurance),
              iban: encryptField("DE89 3704 0044 0532 0130 00"),
              location: LOCATIONS[p.locs[0]].name, team: TEAM_NAMES[p.team], role: roleOf(p.roleKey).name, startDate: p.start, endDate: p.endDate ?? "", contract: p.contract,
              weeklyHours: `${p.hours} Std/Woche`, tenure: tenureYears <= 0 ? "unter 1 Jahr" : tenureYears === 1 ? "1 Jahr" : `${tenureYears} Jahre`, status: "active",
              email: p.email, phone: `+49 151 2040 ${String(1000 + p.i).slice(-4)}`, vacationTotal: p.vacation, workDaysJson: p.days,
              emergencyContactsJson: encryptField(JSON.stringify([{ id: cuid(), name: `${p.gender === "m" ? "Anna" : "Michael"} ${p.last}`, relation: p.marital === "verheiratet" ? (p.gender === "m" ? "Ehefrau" : "Ehemann") : "Elternteil", phone: `+49 160 3050 ${String(2000 + p.i).slice(-4)}`, isPrimary: true }])),
              maternityProtectionNote: "",
            },
          });
          await tx.tenantEmployeeTimeline.createMany({
            data: [
              { tenantId, employeeId: p.employeeId, title: "Mitarbeiter angelegt", tone: "success", createdAt: minutes(now, -60 * 24 * 14) },
              { tenantId, employeeId: p.employeeId, title: `Neuer Vertrag hinterlegt: Arbeitsvertrag ab ${fmtDe(p.start)}`, tone: "ink", createdAt: minutes(now, -60 * 24 * 13) },
            ],
          });
          for (const l of p.locs) await tx.tenantLocationMember.create({ data: { locationId: locId[l], employeeId: p.employeeId, initials: p.initials, name: p.name } });
          await tx.tenantTeamMember.create({ data: { teamId: teamId[p.team], employeeId: p.employeeId, initials: p.initials, name: p.name, location: LOCATIONS[p.locs[0]].name, role: roleOf(p.roleKey).name, contract: p.contract, status: "on-duty", isLead: false } });
        }
        for (const k of Object.keys(LOCATIONS) as LocKey[]) {
          const added = people.filter((p) => p.locs.includes(k)).length;
          if (added) await tx.tenantLocation.update({ where: { id: locId[k] }, data: { employeeCount: { increment: added } } });
        }

        // Dateien, Verträge, Abrechnungen
        await tx.tenantFile.createMany({ data: files });
        for (const p of people) {
          const comp = compensationText(p);
          const fileId = contractFileIds.get(p.emailLocal)!;
          const file = files.find((f) => f.id === fileId)!;
          const workLocation = p.locs.map((l) => LOCATIONS[l].name).join(", ");
          await tx.tenantEmployeeContract.create({
            data: {
              tenantId, employeeId: p.employeeId, fileId, title: `Arbeitsvertrag ab ${fmtDe(p.start)}`, contractType: p.contractType, status: "active",
              startDate: p.start, endDate: p.endDate ?? "", probationEndDate: addDaysIso(p.start, 182), noticePeriod: "Gesetzlich (§ 622 BGB)", position: p.position,
              department: TEAM_NAMES[p.team], workLocation, weeklyHours: `${p.hours} Std/Woche`, compensation: encryptField(comp), vacationDays: p.vacation,
            },
          });
          await tx.tenantEmployeeContractDetails.create({
            data: {
              tenantId, employeeId: p.employeeId, linkedFileName: file.displayName as string, linkedFileMeta: `PDF · ${Math.ceil((file.sizeBytes as number) / 1024)} KB`,
              contractType: p.contractType, entryDate: p.start, exitDate: p.endDate ?? "", fixedTerm: p.endDate ? `bis ${fmtDe(p.endDate)}` : "Unbefristet", probation: "6 Monate",
              position: p.position, department: TEAM_NAMES[p.team], supervisor: TEAM_LEAD[p.team], workLocation,
              parties: `${TENANT_NAME} / ${p.name}`, compensation: encryptField(comp), compensationGross: encryptField(euro(p.pay.monthly)),
              workingTime: `${p.hours} Std/Woche (${p.days.join(", ")})`, vacation: `${p.vacation} Arbeitstage`, noticePeriod: "Gesetzlich (§ 622 BGB)",
              collectiveAgreement: "Angelehnt an Manteltarifvertrag Hotel- und Gaststättengewerbe Bayern", clauses: ["Verschwiegenheit", "Belehrung nach § 43 IfSG"],
            },
          });
          const pay = payrollFileIds.get(p.emailLocal);
          if (pay) await tx.tenantPayrollStatement.create({ data: { tenantId, employeeId: p.employeeId, fileId: pay.id, period: "September 2026", issuedAt: berlin("2026-09-30", "10:00"), gross: encryptField(pay.gross), net: encryptField(pay.net), status: "available" } });
        }

        // Schichten + veröffentlichte Wochen-Snapshots ergänzen
        const seededAt = minutes(now, -60 * 24 * 14);
        await tx.tenantShift.createMany({ data: shifts.map((s) => ({ id: s.id, tenantId, key: s.key, date: s.date, weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, breakMinutes: s.breakMinutes, team: s.team, note: s.note, employeeId: s.employeeId, locationId: s.locationId, createdAt: seededAt, updatedAt: seededAt })) });
        for (const w of publishedWeeks) {
          const monday = mondayOfIsoWeek(w.year, w.week);
          const sunday = addDaysIso(monday, 6);
          const inWeek = shifts.filter((s) => s.date >= monday && s.date <= sunday);
          if (!inWeek.length) continue;
          const counts = { ...((w.employeeShiftCountsJson ?? {}) as Record<string, number>) };
          for (const s of inWeek) counts[s.employeeId] = (counts[s.employeeId] ?? 0) + 1;
          const snapshot = [...((w.publishedShiftsJson ?? []) as Prisma.JsonArray), ...inWeek.map((s) => ({ id: s.id, key: s.key, employeeId: s.employeeId, locationId: s.locationId, team: s.team, weekday: s.weekday, date: s.date, startTime: s.startTime, endTime: s.endTime, time: `${s.startTime} – ${s.endTime}`, location: LOCATIONS[s.locKey].name, locationAccentClassName: LOCATIONS[s.locKey].accent, note: s.note, breakMinutes: s.breakMinutes }))];
          await tx.tenantShiftWeek.update({ where: { id: w.id }, data: { employeeShiftCountsJson: counts, publishedShiftsJson: snapshot } });
          const publishedAt = w.publishedAt ?? now;
          const weekRange = `${fmtDe(monday).slice(0, 5)}-${fmtDe(sunday)}`;
          for (const p of people) {
            const mine = inWeek.filter((s) => s.employeeId === p.employeeId);
            if (!mine.length) continue;
            notify(p, "shift", { key: "shiftPlanPublished", tenantName: TENANT_NAME, week: w.week, weekRange, shifts: mine.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime })) }, "shift-week", `${w.year}-W${pad2(w.week)}`, publishedAt, monday < currentMonday);
          }
        }

        // Urlaub
        let vacN = maxKeyNumber(vacKeys.map((v) => v.key), "urlaub-");
        for (const v of VACATIONS) {
          const p = who(v.who);
          const id = cuid();
          const days = calculateVacationWorkDays(v.start, v.end, new Set(p.days), BUNDESLAND);
          const createdAt = minutes(now, -60 * 24 * 5);
          const decidedAt = v.status === "pending" ? null : minutes(createdAt, 60 * 26);
          await tx.tenantVacationRequest.create({ data: { id, tenantId, employeeId: p.employeeId, key: `urlaub-${++vacN}`, startDate: v.start, endDate: v.end, days, status: v.status, note: v.note, decidedAt, decidedBy: v.decidedBy ?? "", createdAt } });
          if (v.status !== "pending") notify(p, "vacation", { key: "vacationDecided", tenantName: TENANT_NAME, startDate: v.start, endDate: v.end, status: v.status }, "vacation-request", id, decidedAt!, false);
        }

        // Krankheit
        for (const s of SICKNESS) {
          const p = who(s.who);
          await tx.tenantSicknessReport.create({ data: { tenantId, employeeId: p.employeeId, startDate: berlin(s.start, "00:00"), endDate: berlin(s.end, "00:00"), status: "closed", certificateStatus: "received", reportChannel: "phone", note: encryptField(s.note), reportedById: hr.id, reportedByName: hr.name, closedAt: berlin(addDaysIso(s.end, 1), "09:00"), createdAt: berlin(s.start, "07:05") } });
        }

        // Wunschfrei
        let wishN = maxKeyNumber(wishKeys.map((w) => w.key), "wunschfrei-");
        for (const w of WISHES) {
          const p = who(w.who);
          await tx.tenantWishFreeRequest.create({ data: { id: cuid(), tenantId, employeeId: p.employeeId, key: `wunschfrei-${++wishN}`, date: w.date, status: "open", reason: w.reason, rejectReason: "", decidedAt: null, decidedBy: "", createdAt: minutes(now, -60 * 24 * 2) } });
        }

        // Erinnerung: Probezeitgespräch
        const remN = maxKeyNumber(remKeys.map((r) => r.key), "erinnerung-");
        await tx.tenantReminder.create({ data: { tenantId, key: `erinnerung-${remN + 1}`, title: "Probezeitgespräch Hannah Vogel", subject: "Zwischengespräch nach 3 Monaten (Probezeit endet 31.03.2027)", category: "Personal", dueDate: "2026-12-15", priority: "normal", status: "open", completedAt: null, createdById: hr.id, createdByName: hr.name, teamId: teamId.service, createdAt: minutes(now, -60 * 24 * 9) } });

        // Info-Anfrage
        {
          const p = who("vogel");
          const id = cuid();
          const createdAt = minutes(now, -60 * 24 * 6);
          const title = "Nachweis Belehrung § 43 IfSG";
          const dueAt = berlin("2026-10-24", "23:59");
          await tx.tenantEmployeeInfoRequest.create({ data: { id, tenantId, employeeId: p.employeeId, title, message: "Bitte lade die Bescheinigung über die Erstbelehrung nach § 43 IfSG (Gesundheitsamt) hoch.", requestedBy: hr.name, dueAt, fileRequested: true, status: "open", createdAt } });
          notify(p, "system", { key: "infoRequest", tenantName: TENANT_NAME, title, dueAt }, "info-request", id, createdAt, false);
        }

        // Zeiterfassung
        for (const e of entries) {
          await tx.tenantTimeEntry.create({ data: { id: e.id, tenantId, employeeId: e.employeeId, clockInAt: e.clockInAt, clockOutAt: e.clockOutAt, shiftId: e.shiftId, plannedStartAt: e.plannedStartAt, plannedEndAt: e.plannedEndAt, shiftLocation: e.shiftLocation, clockInLocationId: e.clockInLocationId, clockInLocationName: e.clockInLocationName, source: e.source, autoClosed: false, note: "", correctedAt: null, correctedBy: "", createdAt: e.clockInAt } });
          if (e.breaks.length) await tx.tenantTimeBreak.createMany({ data: e.breaks.map((b) => ({ timeEntryId: e.id, startAt: b.startAt, endAt: b.endAt })) });
        }

        await tx.tenantEmployeeNotification.createMany({ data: notifications });
        await tx.tenantAuditLog.create({ data: { tenantId, actorId: "", actorName: "System (Demo-Daten)", action: "Demo-Mitarbeiter ergänzt", source: "Seed", entityType: "tenant", entityId: tenantId, detail: `5 weitere Testkonten ergänzt: ${people.map((p) => p.name).join(", ")}.` } });

        if (DRY_RUN) throw new DryRunRollback();
      }, { timeout: 300_000, maxWait: 20_000 });
    } catch (error) {
      if (!(error instanceof DryRunRollback)) throw error;
      console.log("[extend] DRY-RUN: alles geschrieben und wieder zurückgerollt.");
    }

    writeFileSync(OUT, JSON.stringify({
      dryRun: DRY_RUN,
      counts: { shifts: shifts.length, timeEntries: entries.length, files: files.length, notifications: notifications.length },
      accounts: people.map((p) => ({
        nr: p.i + 1, name: p.name, email: p.email, password: DRY_RUN ? "(dry-run)" : p.password, role: roleOf(p.roleKey).name, position: p.position,
        team: TEAM_NAMES[p.team], locations: p.locs.map((l) => LOCATIONS[l].name), contract: p.contract, hours: p.hours, days: p.days, number: p.number,
        shiftsUpcoming: shifts.filter((s) => s.employeeId === p.employeeId && s.date > today && s.date <= addDaysIso(currentMonday, 7 * 6 - 1)).length,
        tester: p.tester,
      })),
    }, null, 2), { mode: 0o600 });
    console.log(`[extend] Fertig${DRY_RUN ? " (DRY-RUN)" : ""}. ${shifts.length} Schichten, ${entries.length} Zeiteinträge, ${files.length} Dateien, ${notifications.length} Benachrichtigungen. Ausgabe: ${OUT}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
