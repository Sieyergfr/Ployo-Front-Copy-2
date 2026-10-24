/**
 * Legt den Demo-Betrieb "Ployo Demo Gastro GmbH" fuer die 20 Google-Play-
 * Tester an: 20 Konten (nachname.test@ployo.io), Standorte, Teams, Rollen,
 * Personalakten inkl. Vertrag/Lohnabrechnung (echte PDFs im Storage),
 * Urlaub, Krankheit, Wunschfrei, Erinnerungen, Info-Anfragen,
 * Zeiterfassung und Schichtplaene (2 Wochen zurueck, laufende Woche,
 * 5 Wochen voraus veroeffentlicht + 1 Woche Entwurf).
 *
 * REIN ADDITIV: loescht nichts. Bricht ab, wenn der Slug oder eine der
 * 20 E-Mail-Adressen schon existiert. Alle DB-Schreibvorgaenge laufen in
 * EINER Transaktion; Datei-Uploads passieren vorher (verwaiste Objekte im
 * Storage bei einem Abbruch sind harmlos).
 *
 * Aufruf (server-only-Stub + .env):
 *   NODE_OPTIONS="--require <stub-server-only.cjs> --require dotenv/config" \
 *     npx tsx scripts/seed-play-test-demo.ts --out <credentials.json> [--skip-uploads]
 */
import { randomBytes, randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";
import { PrismaClient, Prisma, type Weekday } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { encryptField } from "../lib/encryption";
import { encryptAddress } from "../lib/employee-address";
import { normalizeAddressInput } from "../lib/address";
import { permissionAreas, permissionRoles, hasPermissionLevel, emptyShiftsLevelSet, fullPermissionScopeSet, buildRolePermissionCreateData, type PermissionLevel, type PermissionRole } from "../lib/roles";
import { calculateVacationWorkDays } from "../lib/vacations";
import { requiredBreakMinutes, findRestPeriodViolation } from "../lib/arbzg-rules";
import { renderNotification, type NotificationMessage } from "../lib/notifications/messages";
import { generateClockQrToken } from "../lib/time-clock-qr";
import { buildStorageKey, getFileExtension } from "../lib/storage/key-builder";
import { uploadObject } from "../lib/storage/upload";
import { getStorageBucket } from "../lib/storage/buckets";

const args = process.argv.slice(2);
const OUT = args[args.indexOf("--out") + 1];
const SKIP_UPLOADS = args.includes("--skip-uploads");
if (!args.includes("--out") || !OUT) throw new Error("--out <datei.json> fehlt");

const TENANT_SLUG = "ployo-demo-gastro";
const TENANT_NAME = "Ployo Demo Gastro GmbH";
const BUNDESLAND = "BY" as const;

// ---------------------------------------------------------------- Helfer

const cuid = () => "c" + randomBytes(12).toString("hex").slice(0, 24);
const pad2 = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const parseIso = (s: string) => new Date(`${s}T00:00:00Z`);
const addDaysIso = (s: string, n: number) => { const d = parseIso(s); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); };
const WD: Weekday[] = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const weekdayOf = (s: string): Weekday => WD[(parseIso(s).getUTCDay() + 6) % 7];
const fmtDe = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;

function isoWeek(s: string) {
  const d = parseIso(s);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7) };
}
const mondayOf = (s: string) => addDaysIso(s, -((parseIso(s).getUTCDay() + 6) % 7));

/** Lokale Berliner Uhrzeit -> echter Zeitpunkt (DST-sicher). */
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

const LOCATIONS: Record<LocKey, { name: string; kind: string; accent: string; street: string; no: string; zip: string; minStaff: number | null; hours: unknown[] }> = {
  altstadt: {
    name: "Restaurant Altstadt", kind: "Filiale", accent: "bg-[#C9622A]", street: "Beispielgasse", no: "7", zip: "80331", minStaff: 4,
    hours: [
      { weekday: "Mo", mode: "closed", ranges: [] },
      ...["Di", "Mi", "Do", "Fr", "Sa"].map((w) => ({ weekday: w, mode: "custom", ranges: [{ start: "11:30", end: "23:00", breakMinutes: 0 }] })),
      { weekday: "So", mode: "custom", ranges: [{ start: "11:30", end: "22:00", breakMinutes: 0 }] },
    ],
  },
  schwabing: {
    name: "Café Schwabing", kind: "Filiale", accent: "bg-[#8B6ED4]", street: "Musterallee", no: "24", zip: "80799", minStaff: 3,
    hours: WD.map((w) => ({ weekday: w, mode: "custom", ranges: [{ start: "07:30", end: "19:00", breakMinutes: 0 }] })),
  },
  verwaltung: {
    name: "Verwaltung München", kind: "Verwaltung", accent: "bg-[#5C6B7A]", street: "Beispielstraße", no: "12", zip: "80335", minStaff: null,
    hours: [
      ...["Mo", "Di", "Mi", "Do", "Fr"].map((w) => ({ weekday: w, mode: "custom", ranges: [{ start: "08:00", end: "17:00", breakMinutes: 30 }] })),
      { weekday: "Sa", mode: "closed", ranges: [] },
      { weekday: "So", mode: "closed", ranges: [] },
    ],
  },
};

const TEAMS: Record<TeamKey, { name: string; description: string; color: string; locs: LocKey[] }> = {
  kueche: { name: "Küche", description: "Küchenbrigade des Restaurants Altstadt: Warme Küche, Kalte Küche, Spüle.", color: "bg-[#C9622A]", locs: ["altstadt"] },
  service: { name: "Service", description: "Service und Bar im Restaurant Altstadt.", color: "bg-[#2A5BC9]", locs: ["altstadt"] },
  cafe: { name: "Café & Bar", description: "Barista, Theke und Konditorei im Café Schwabing.", color: "bg-[#7A3C9C]", locs: ["schwabing"] },
  verwaltung: { name: "Verwaltung", description: "Geschäftsführung, Personal, Lohnbuchhaltung und Betriebsleitung.", color: "bg-[#4A5568]", locs: ["verwaltung"] },
};

const SHIFTS = {
  kF: { start: "09:00", end: "17:00", brk: 30, label: "Küche Früh" },
  kS: { start: "15:00", end: "23:00", brk: 30, label: "Küche Spät" },
  sF: { start: "10:30", end: "18:00", brk: 30, label: "Service Früh" },
  sS: { start: "15:30", end: "23:30", brk: 30, label: "Service Spät" },
  cF: { start: "07:00", end: "14:30", brk: 30, label: "Café Früh" },
  cS: { start: "12:00", end: "19:30", brk: 30, label: "Café Spät" },
  office: { start: "08:30", end: "17:00", brk: 30, label: "Büro" },
} satisfies Record<string, ShiftDef>;

type Pattern =
  | { kind: "fixed"; shift: ShiftDef }
  | { kind: "rotate"; early: ShiftDef; late: ShiftDef; offset: 0 | 1 };

type Membership = "OWNER" | "ADMIN" | "HR" | "EMPLOYEE";

type Person = {
  first: string; last: string; emailLocal: string; gender: "m" | "w";
  position: string; team: TeamKey; locs: LocKey[]; membership: Membership; roleKey: string;
  contract: "Unbefristet" | "Teilzeit" | "Befristet" | "Werkstudentin";
  contractType: "Arbeitsvertrag" | "Teilzeitvertrag" | "Befristeter Arbeitsvertrag";
  hours: number; days: Weekday[]; pattern: Pattern; isLead?: boolean;
  start: string; birth: string; birthPlace: string; nationality: string; marital: string;
  street: string; no: string; zip: string; insurance: string;
  pay: { monthly?: number; hourly?: number }; vacation: number; endDate?: string;
  tester: string;
};

const P: Person[] = [
  { first: "David", last: "Demo", emailLocal: "demo", gender: "m", position: "Geschäftsführer", team: "verwaltung", locs: ["verwaltung"], membership: "OWNER", roleKey: "geschaeftsfuehrung", contract: "Unbefristet", contractType: "Arbeitsvertrag", hours: 40, days: ["Mo", "Di", "Mi", "Do", "Fr"], pattern: { kind: "fixed", shift: SHIFTS.office }, isLead: true, start: "2019-04-01", birth: "1981-06-14", birthPlace: "München", nationality: "deutsch", marital: "verheiratet", street: "Lindenstraße", no: "3", zip: "81545", insurance: "Techniker Krankenkasse", pay: { monthly: 6200 }, vacation: 30,
    tester: "Tenant-Admin / Inhaber. Sieht und darf alles: Einstellungen, Abrechnung/Plan, Rollen, alle Mitarbeiter, Schichtplanung, Reports. Am besten im Web-Dashboard und in der App testen." },
  { first: "Julia", last: "Hofmann", emailLocal: "hofmann", gender: "w", position: "Betriebsleiterin Gastronomie", team: "verwaltung", locs: ["altstadt", "schwabing"], membership: "ADMIN", roleKey: "standortleitung", contract: "Unbefristet", contractType: "Arbeitsvertrag", hours: 40, days: ["Di", "Mi", "Do", "Fr", "Sa"], pattern: { kind: "fixed", shift: { start: "10:00", end: "18:30", brk: 30, label: "Betriebsleitung" } }, start: "2020-02-01", birth: "1986-11-02", birthPlace: "Augsburg", nationality: "deutsch", marital: "ledig", street: "Gartenweg", no: "18", zip: "80469", insurance: "AOK Bayern", pay: { monthly: 4800 }, vacation: 30,
    tester: "Administratorin (Mandanten-Admin, volle Rechte wie der Inhaber außer Inhaberschaft). Fachlich Betriebsleitung beider Gastronomie-Standorte – ideal für Schichtplanung, Urlaubs-/Wunschfrei-Freigaben und Zeiterfassung." },
  { first: "Sabine", last: "Krüger", emailLocal: "krueger", gender: "w", position: "Personalleiterin", team: "verwaltung", locs: ["verwaltung"], membership: "HR", roleKey: "hr-lead", contract: "Unbefristet", contractType: "Arbeitsvertrag", hours: 40, days: ["Mo", "Di", "Mi", "Do", "Fr"], pattern: { kind: "fixed", shift: SHIFTS.office }, start: "2020-09-01", birth: "1979-03-27", birthPlace: "Regensburg", nationality: "deutsch", marital: "verheiratet", street: "Ahornring", no: "9", zip: "81369", insurance: "Barmer", pay: { monthly: 5100 }, vacation: 30,
    tester: "HR-Konto (Personal). Personalakten inkl. sensibler Daten, Verträge, Lohnabrechnungen, Krankmeldungen, Urlaub, Info-Anfragen an Mitarbeiter." },
  { first: "Thomas", last: "Brandt", emailLocal: "brandt", gender: "m", position: "Lohnbuchhalter", team: "verwaltung", locs: ["verwaltung"], membership: "EMPLOYEE", roleKey: "payroll", contract: "Teilzeit", contractType: "Teilzeitvertrag", hours: 30, days: ["Mo", "Di", "Mi", "Do"], pattern: { kind: "fixed", shift: { start: "08:00", end: "16:00", brk: 30, label: "Büro Teilzeit" } }, start: "2021-01-15", birth: "1975-08-09", birthPlace: "Ingolstadt", nationality: "deutsch", marital: "geschieden", street: "Birkenallee", no: "41", zip: "81675", insurance: "DAK-Gesundheit", pay: { monthly: 3300 }, vacation: 24,
    tester: "Rolle \"Lohnbuchhaltung\": liest Verträge, Lohnabrechnungen, Zeiterfassung und Urlaub aller Mitarbeiter, darf Abrechnungen hochladen. Keine Schichtplanung, keine Rollen/Einstellungen." },
  { first: "Markus", last: "Schuster", emailLocal: "schuster", gender: "m", position: "Küchenchef", team: "kueche", locs: ["altstadt"], membership: "EMPLOYEE", roleKey: "teamlead", contract: "Unbefristet", contractType: "Arbeitsvertrag", hours: 38, days: ["Di", "Mi", "Do", "Fr", "Sa"], pattern: { kind: "rotate", early: SHIFTS.kF, late: SHIFTS.kS, offset: 0 }, isLead: true, start: "2019-06-01", birth: "1983-01-21", birthPlace: "Rosenheim", nationality: "deutsch", marital: "verheiratet", street: "Kastanienweg", no: "5", zip: "81541", insurance: "AOK Bayern", pay: { monthly: 4200 }, vacation: 30,
    tester: "Teamleitung Küche. Plant Schichten, genehmigt Urlaub/Wunschfrei und sieht Krankmeldungen und Zeiten – aber nur für das eigene Team Küche." },
  { first: "Elena", last: "Richter", emailLocal: "richter", gender: "w", position: "Restaurantleiterin / Serviceleitung", team: "service", locs: ["altstadt"], membership: "EMPLOYEE", roleKey: "teamlead", contract: "Unbefristet", contractType: "Arbeitsvertrag", hours: 38, days: ["Mi", "Do", "Fr", "Sa", "So"], pattern: { kind: "rotate", early: SHIFTS.sF, late: SHIFTS.sS, offset: 0 }, isLead: true, start: "2021-03-01", birth: "1990-05-30", birthPlace: "Nürnberg", nationality: "deutsch", marital: "ledig", street: "Rosenstraße", no: "22", zip: "80331", insurance: "Techniker Krankenkasse", pay: { monthly: 3700 }, vacation: 30,
    tester: "Teamleitung Service (Restaurant Altstadt). Wie Küchenchef, aber für das Team Service." },
  { first: "Can", last: "Yilmaz", emailLocal: "yilmaz", gender: "m", position: "Café-Leitung", team: "cafe", locs: ["schwabing"], membership: "EMPLOYEE", roleKey: "teamlead", contract: "Unbefristet", contractType: "Arbeitsvertrag", hours: 38, days: ["Mo", "Di", "Mi", "Do", "Fr"], pattern: { kind: "rotate", early: SHIFTS.cF, late: SHIFTS.cS, offset: 0 }, isLead: true, start: "2022-05-01", birth: "1992-09-12", birthPlace: "München", nationality: "deutsch", marital: "verheiratet", street: "Ulmenstraße", no: "14", zip: "80801", insurance: "BKK Mobil", pay: { monthly: 3500 }, vacation: 30,
    tester: "Teamleitung Café & Bar (Café Schwabing). Hat genehmigten Urlaub in KW 45." },
  { first: "Stefan", last: "Becker", emailLocal: "becker", gender: "m", position: "Sous-Chef", team: "kueche", locs: ["altstadt"], membership: "EMPLOYEE", roleKey: "employee", contract: "Unbefristet", contractType: "Arbeitsvertrag", hours: 38, days: ["Mi", "Do", "Fr", "Sa", "So"], pattern: { kind: "rotate", early: SHIFTS.kF, late: SHIFTS.kS, offset: 1 }, start: "2020-08-01", birth: "1988-12-03", birthPlace: "Passau", nationality: "deutsch", marital: "ledig", street: "Fichtenweg", no: "2", zip: "81549", insurance: "AOK Bayern", pay: { monthly: 3400 }, vacation: 30,
    tester: "Normaler Mitarbeiter (Self-Service). War letzte Woche krank (Krankmeldung abgeschlossen, AU liegt vor)." },
  { first: "Nina", last: "Lehmann", emailLocal: "lehmann", gender: "w", position: "Köchin", team: "kueche", locs: ["altstadt"], membership: "EMPLOYEE", roleKey: "employee", contract: "Unbefristet", contractType: "Arbeitsvertrag", hours: 38, days: ["Di", "Mi", "Do", "Fr", "Sa"], pattern: { kind: "rotate", early: SHIFTS.kF, late: SHIFTS.kS, offset: 1 }, start: "2022-09-01", birth: "1996-04-17", birthPlace: "Landshut", nationality: "deutsch", marital: "ledig", street: "Eichenstraße", no: "33", zip: "81371", insurance: "Barmer", pay: { monthly: 2950 }, vacation: 30,
    tester: "Normale Mitarbeiterin (Self-Service). Urlaub im Sommer genehmigt, Krankmeldung im September." },
  { first: "Ali", last: "Demir", emailLocal: "demir", gender: "m", position: "Beikoch", team: "kueche", locs: ["altstadt"], membership: "EMPLOYEE", roleKey: "employee", contract: "Teilzeit", contractType: "Teilzeitvertrag", hours: 30, days: ["Do", "Fr", "Sa", "So"], pattern: { kind: "rotate", early: SHIFTS.kF, late: SHIFTS.kS, offset: 0 }, start: "2023-04-01", birth: "1994-07-08", birthPlace: "Izmir", nationality: "türkisch", marital: "verheiratet", street: "Tulpenweg", no: "11", zip: "81547", insurance: "AOK Bayern", pay: { monthly: 2250 }, vacation: 24,
    tester: "Teilzeit-Mitarbeiter (4-Tage-Woche). Ein Urlaubsantrag wurde abgelehnt." },
  { first: "Paul", last: "Zimmermann", emailLocal: "zimmermann", gender: "m", position: "Küchenhilfe (Minijob)", team: "kueche", locs: ["altstadt"], membership: "EMPLOYEE", roleKey: "employee", contract: "Teilzeit", contractType: "Teilzeitvertrag", hours: 10, days: ["Fr", "Sa"], pattern: { kind: "fixed", shift: { start: "17:00", end: "22:00", brk: 0, label: "Spüle Abend" } }, start: "2024-10-01", birth: "2003-02-25", birthPlace: "Freising", nationality: "deutsch", marital: "ledig", street: "Am Bach", no: "6", zip: "85354", insurance: "Techniker Krankenkasse", pay: { hourly: 13.9 }, vacation: 12,
    tester: "Minijobber, nur Fr+Sa abends. Hat eine offene Info-Anfrage (Nachweis hochladen)." },
  { first: "Felix", last: "Hartung", emailLocal: "hartung", gender: "m", position: "Auszubildender Koch (2. Lehrjahr)", team: "kueche", locs: ["altstadt"], membership: "EMPLOYEE", roleKey: "employee", contract: "Befristet", contractType: "Befristeter Arbeitsvertrag", hours: 38, days: ["Di", "Mi", "Do", "Fr", "Sa"], pattern: { kind: "fixed", shift: SHIFTS.kF }, start: "2025-09-01", endDate: "2028-08-31", birth: "2006-03-19", birthPlace: "Erding", nationality: "deutsch", marital: "ledig", street: "Wiesenstraße", no: "27", zip: "85435", insurance: "AOK Bayern", pay: { monthly: 1050 }, vacation: 27,
    tester: "Auszubildender (befristeter Vertrag). Offener Wunschfrei-Antrag und offene Info-Anfrage." },
  { first: "Laura", last: "Schmitt", emailLocal: "schmitt", gender: "w", position: "Servicekraft", team: "service", locs: ["altstadt"], membership: "EMPLOYEE", roleKey: "employee", contract: "Unbefristet", contractType: "Arbeitsvertrag", hours: 38, days: ["Di", "Mi", "Do", "Fr", "Sa"], pattern: { kind: "rotate", early: SHIFTS.sF, late: SHIFTS.sS, offset: 1 }, start: "2021-07-01", birth: "1995-10-05", birthPlace: "Würzburg", nationality: "deutsch", marital: "ledig", street: "Sonnenstraße", no: "15", zip: "80331", insurance: "Techniker Krankenkasse", pay: { monthly: 2700 }, vacation: 30,
    tester: "Servicekraft. Hat genehmigten Urlaub in KW 43 (20.–24.10.) – dort keine Schichten." },
  { first: "Jonas", last: "Klein", emailLocal: "klein", gender: "m", position: "Servicekraft", team: "service", locs: ["altstadt"], membership: "EMPLOYEE", roleKey: "employee", contract: "Teilzeit", contractType: "Teilzeitvertrag", hours: 30, days: ["Do", "Fr", "Sa", "So"], pattern: { kind: "fixed", shift: SHIFTS.sS }, start: "2023-02-15", birth: "1998-01-29", birthPlace: "Kempten", nationality: "deutsch", marital: "ledig", street: "Bergweg", no: "8", zip: "81373", insurance: "DAK-Gesundheit", pay: { monthly: 2100 }, vacation: 24,
    tester: "Teilzeit-Servicekraft (immer Spätschicht). Offener Urlaubsantrag Ende Oktober – gut zum Genehmigen/Ablehnen durch Admin/Teamleitung." },
  { first: "Marie", last: "Wolf", emailLocal: "wolf", gender: "w", position: "Servicekraft (Werkstudentin)", team: "service", locs: ["altstadt"], membership: "EMPLOYEE", roleKey: "employee", contract: "Werkstudentin", contractType: "Befristeter Arbeitsvertrag", hours: 20, days: ["Fr", "Sa", "So"], pattern: { kind: "fixed", shift: { start: "16:30", end: "23:30", brk: 30, label: "Service Abend" } }, start: "2025-05-15", endDate: "2026-11-15", birth: "2001-12-11", birthPlace: "Bamberg", nationality: "deutsch", marital: "ledig", street: "Leopoldstraße", no: "70", zip: "80802", insurance: "Techniker Krankenkasse", pay: { hourly: 15.5 }, vacation: 18,
    tester: "Werkstudentin (befristet bis 15.11.2026, Erinnerung dazu angelegt). Offene Info-Anfrage Immatrikulationsbescheinigung." },
  { first: "Tim", last: "Schäfer", emailLocal: "schaefer", gender: "m", position: "Barkeeper", team: "service", locs: ["altstadt"], membership: "EMPLOYEE", roleKey: "employee", contract: "Unbefristet", contractType: "Arbeitsvertrag", hours: 38, days: ["Mi", "Do", "Fr", "Sa", "So"], pattern: { kind: "fixed", shift: SHIFTS.sS }, start: "2022-03-01", birth: "1993-06-23", birthPlace: "Salzburg", nationality: "österreichisch", marital: "ledig", street: "Isarstraße", no: "4", zip: "81667", insurance: "AOK Bayern", pay: { monthly: 2800 }, vacation: 30,
    tester: "Barkeeper (immer Spätschicht). Offener Wunschfrei-Antrag für 31.10." },
  { first: "Sophie", last: "Neumann", emailLocal: "neumann", gender: "w", position: "Barista", team: "cafe", locs: ["schwabing"], membership: "EMPLOYEE", roleKey: "employee", contract: "Unbefristet", contractType: "Arbeitsvertrag", hours: 38, days: ["Mi", "Do", "Fr", "Sa", "So"], pattern: { kind: "rotate", early: SHIFTS.cF, late: SHIFTS.cS, offset: 1 }, start: "2023-08-01", birth: "1997-02-14", birthPlace: "Ulm", nationality: "deutsch", marital: "ledig", street: "Hohenzollernstraße", no: "19", zip: "80801", insurance: "Barmer", pay: { monthly: 2650 }, vacation: 30,
    tester: "Barista. Offener Urlaubsantrag im November, abgelehnter Wunschfrei-Antrag." },
  { first: "Lukas", last: "Braun", emailLocal: "braun", gender: "m", position: "Barista", team: "cafe", locs: ["schwabing"], membership: "EMPLOYEE", roleKey: "employee", contract: "Teilzeit", contractType: "Teilzeitvertrag", hours: 30, days: ["Mo", "Di", "Sa", "So"], pattern: { kind: "rotate", early: SHIFTS.cF, late: SHIFTS.cS, offset: 0 }, start: "2024-01-08", birth: "1999-09-30", birthPlace: "Göttingen", nationality: "deutsch", marital: "ledig", street: "Belgradstraße", no: "12", zip: "80796", insurance: "Techniker Krankenkasse", pay: { monthly: 2050 }, vacation: 24,
    tester: "Teilzeit-Barista. Aktuell KRANK gemeldet (09.–13.10., AU noch ausstehend) – zeigt den Status \"abwesend\"." },
  { first: "Emma", last: "Krause", emailLocal: "krause", gender: "w", position: "Konditorin", team: "cafe", locs: ["schwabing"], membership: "EMPLOYEE", roleKey: "employee", contract: "Unbefristet", contractType: "Arbeitsvertrag", hours: 38, days: ["Mo", "Di", "Mi", "Do", "Fr"], pattern: { kind: "fixed", shift: { start: "06:00", end: "14:00", brk: 30, label: "Konditorei" } }, start: "2022-11-01", birth: "1991-08-01", birthPlace: "Dresden", nationality: "deutsch", marital: "verheiratet", street: "Kurfürstenstraße", no: "29", zip: "80801", insurance: "AOK Bayern", pay: { monthly: 2900 }, vacation: 30,
    tester: "Konditorin (Frühdienst ab 06:00). Genehmigter Wunschfrei-Tag 30.10." },
  { first: "Mia", last: "Lorenz", emailLocal: "lorenz", gender: "w", position: "Servicekraft Café (Minijob)", team: "cafe", locs: ["schwabing"], membership: "EMPLOYEE", roleKey: "employee", contract: "Teilzeit", contractType: "Teilzeitvertrag", hours: 10, days: ["Sa", "So"], pattern: { kind: "fixed", shift: { start: "11:00", end: "16:00", brk: 0, label: "Wochenende Mittag" } }, start: "2025-03-01", birth: "2004-05-06", birthPlace: "München", nationality: "deutsch", marital: "ledig", street: "Clemensstraße", no: "45", zip: "80803", insurance: "Barmer", pay: { hourly: 13.9 }, vacation: 12,
    tester: "Minijobberin, nur Wochenende. Einfachster Self-Service-Fall." },
];

if (P.length !== 20) throw new Error(`Erwartet 20 Personen, sind ${P.length}`);

// Abwesenheiten (Datumsbereiche inklusive)
type VacSeed = { who: string; start: string; end: string; status: "approved" | "pending" | "rejected"; note: string; decidedBy?: string };
const VACATIONS: VacSeed[] = [
  { who: "demo", start: "2026-12-28", end: "2026-12-31", status: "approved", note: "Zwischen den Jahren", decidedBy: "David Demo" },
  { who: "hofmann", start: "2026-08-17", end: "2026-08-28", status: "approved", note: "Sommerurlaub", decidedBy: "David Demo" },
  { who: "krueger", start: "2026-12-21", end: "2026-12-24", status: "pending", note: "Weihnachten bei der Familie" },
  { who: "brandt", start: "2026-10-26", end: "2026-10-29", status: "approved", note: "Herbstferien", decidedBy: "Sabine Krüger" },
  { who: "schuster", start: "2026-05-19", end: "2026-05-30", status: "approved", note: "Pfingsturlaub", decidedBy: "Julia Hofmann" },
  { who: "richter", start: "2026-06-02", end: "2026-06-13", status: "approved", note: "Urlaub Italien", decidedBy: "Julia Hofmann" },
  { who: "yilmaz", start: "2026-11-02", end: "2026-11-06", status: "approved", note: "Familienbesuch", decidedBy: "Julia Hofmann" },
  { who: "becker", start: "2026-07-14", end: "2026-07-25", status: "approved", note: "Sommerurlaub", decidedBy: "Markus Schuster" },
  { who: "lehmann", start: "2026-08-04", end: "2026-08-14", status: "approved", note: "Sommerurlaub", decidedBy: "Markus Schuster" },
  { who: "demir", start: "2026-10-15", end: "2026-10-18", status: "rejected", note: "Kurzurlaub", decidedBy: "Markus Schuster" },
  { who: "demir", start: "2026-03-05", end: "2026-03-15", status: "approved", note: "Heimaturlaub", decidedBy: "Markus Schuster" },
  { who: "hartung", start: "2026-08-25", end: "2026-09-05", status: "approved", note: "Urlaub zwischen den Berufsschulblöcken", decidedBy: "Markus Schuster" },
  { who: "schmitt", start: "2026-10-20", end: "2026-10-24", status: "approved", note: "Herbsturlaub", decidedBy: "Elena Richter" },
  { who: "klein", start: "2026-10-29", end: "2026-11-01", status: "pending", note: "Verlängertes Wochenende Allerheiligen" },
  { who: "schaefer", start: "2026-04-08", end: "2026-04-19", status: "approved", note: "Urlaub", decidedBy: "Elena Richter" },
  { who: "neumann", start: "2026-11-18", end: "2026-11-22", status: "pending", note: "Städtereise" },
  { who: "neumann", start: "2026-05-06", end: "2026-05-17", status: "approved", note: "Urlaub", decidedBy: "Can Yilmaz" },
  { who: "braun", start: "2026-09-12", end: "2026-09-21", status: "approved", note: "Urlaub", decidedBy: "Can Yilmaz" },
  { who: "krause", start: "2026-05-11", end: "2026-05-22", status: "approved", note: "Urlaub", decidedBy: "Can Yilmaz" },
  { who: "lorenz", start: "2026-12-05", end: "2026-12-13", status: "pending", note: "Prüfungsphase" },
];

type SickSeed = { who: string; start: string; end: string; status: "open" | "closed"; cert: "pending" | "received" | "not-required"; channel: "phone" | "email" | "app" | "manager"; note: string };
const SICKNESS: SickSeed[] = [
  { who: "braun", start: "2026-10-09", end: "2026-10-13", status: "open", cert: "pending", channel: "app", note: "Fieber, AU wird nachgereicht." },
  { who: "becker", start: "2026-10-07", end: "2026-10-08", status: "closed", cert: "received", channel: "phone", note: "Magen-Darm, AU liegt vor." },
  { who: "lehmann", start: "2026-09-22", end: "2026-09-24", status: "closed", cert: "received", channel: "app", note: "Erkältung." },
  { who: "klein", start: "2026-09-04", end: "2026-09-04", status: "closed", cert: "not-required", channel: "phone", note: "Migräne, 1 Tag." },
  { who: "wolf", start: "2026-06-19", end: "2026-06-21", status: "closed", cert: "received", channel: "email", note: "" },
  { who: "schuster", start: "2026-02-10", end: "2026-02-13", status: "closed", cert: "received", channel: "manager", note: "Grippe." },
];

type WishSeed = { who: string; date: string; status: "open" | "approved" | "rejected"; reason: string; rejectReason?: string; decidedBy?: string };
const WISHES: WishSeed[] = [
  { who: "richter", date: "2026-10-25", status: "approved", reason: "Familienfeier", decidedBy: "Julia Hofmann" },
  { who: "schaefer", date: "2026-10-31", status: "open", reason: "Hochzeit eines Freundes" },
  { who: "neumann", date: "2026-10-18", status: "rejected", reason: "Konzertbesuch", rejectReason: "Am Sonntag ist das Café bereits knapp besetzt.", decidedBy: "Can Yilmaz" },
  { who: "hartung", date: "2026-11-04", status: "open", reason: "Zwischenprüfung Berufsschule" },
  { who: "krause", date: "2026-10-30", status: "approved", reason: "Arzttermin", decidedBy: "Can Yilmaz" },
  { who: "becker", date: "2026-11-08", status: "open", reason: "Umzug" },
];

// ---------------------------------------------------------------- PDF

async function makePdf(title: string, lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor(TENANT_NAME);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 790;
  page.drawText(TENANT_NAME, { x: 50, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 30;
  page.drawText(title, { x: 50, y, size: 18, font: bold });
  y -= 30;
  for (const line of lines) {
    if (y < 60) { page = doc.addPage([595, 842]); y = 790; }
    const isHeading = line.startsWith("# ");
    page.drawText(isHeading ? line.slice(2) : line, { x: 50, y, size: isHeading ? 12 : 10, font: isHeading ? bold : font });
    y -= isHeading ? 20 : 15;
  }
  page.drawText("DEMO-DOKUMENT – fiktive Daten für Testzwecke", { x: 50, y: 30, size: 8, font, color: rgb(0.6, 0.2, 0.2) });
  return Buffer.from(await doc.save());
}

// ---------------------------------------------------------------- Main

async function main() {
  const prisma = new PrismaClient();
  try {
    // --- Sicherheitschecks: nichts überschreiben, nichts löschen
    const emails = P.map((p) => `${p.emailLocal}.test@ployo.io`);
    const existingTenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG }, select: { id: true } });
    if (existingTenant) throw new Error(`Tenant-Slug ${TENANT_SLUG} existiert bereits (${existingTenant.id}) – Abbruch, nichts geändert.`);
    const existingUsers = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } });
    if (existingUsers.length) throw new Error(`E-Mails existieren bereits: ${existingUsers.map((u) => u.email).join(", ")} – Abbruch.`);
    if (!process.env.FIELD_ENCRYPTION_KEY) throw new Error("FIELD_ENCRYPTION_KEY nicht geladen – Abbruch (sonst Dev-Schlüssel!).");

    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
    const now = new Date();
    const currentMonday = mondayOf(today);
    const weekMondays = [-2, -1, 0, 1, 2, 3, 4, 5, 6].map((w) => addDaysIso(currentMonday, w * 7));
    const publishedMondays = weekMondays.slice(0, 8); // 2 zurück, laufend, 5 voraus
    const draftMondays = weekMondays.slice(8); // 1 Entwurfswoche

    const tenantId = cuid();
    const ids = {
      loc: Object.fromEntries((Object.keys(LOCATIONS) as LocKey[]).map((k) => [k, cuid()])) as Record<LocKey, string>,
      team: Object.fromEntries((Object.keys(TEAMS) as TeamKey[]).map((k) => [k, cuid()])) as Record<TeamKey, string>,
    };
    const people = P.map((p, i) => ({
      ...p,
      i,
      name: `${p.first} ${p.last}`,
      initials: `${p.first[0]}${p.last[0]}`.toUpperCase(),
      email: `${p.emailLocal}.test@ployo.io`,
      userId: cuid(),
      employeeId: cuid(),
      key: `${p.first}-${p.last}`.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9-]/g, ""),
      number: `MA-${String(i + 1).padStart(4, "0")}`,
      password: makePassword(),
    }));
    const byLocal = new Map(people.map((p) => [p.emailLocal, p]));
    const who = (local: string) => { const p = byLocal.get(local); if (!p) throw new Error(local); return p; };
    const owner = who("demo");

    // --- Abwesenheitstage je Mitarbeiter (keine Schichten an diesen Tagen)
    const blocked = new Map<string, Set<string>>();
    const block = (local: string, start: string, end: string) => {
      const set = blocked.get(local) ?? new Set<string>();
      for (let d = start; d <= end; d = addDaysIso(d, 1)) set.add(d);
      blocked.set(local, set);
    };
    VACATIONS.filter((v) => v.status === "approved").forEach((v) => block(v.who, v.start, v.end));
    SICKNESS.forEach((s) => block(s.who, s.start, s.end));
    WISHES.filter((w) => w.status === "approved").forEach((w) => block(w.who, w.date, w.date));

    // --- Schichten erzeugen
    type ShiftRow = { id: string; key: string; date: string; weekday: Weekday; startTime: string; endTime: string; breakMinutes: number; team: string; note: string; employeeId: string | null; locationId: string; personLocal: string | null; locKey: LocKey };
    const shifts: ShiftRow[] = [];
    let shiftCounter = 0;
    for (const monday of weekMondays) {
      const { week } = isoWeek(monday);
      for (let d = 0; d < 7; d++) {
        const date = addDaysIso(monday, d);
        const weekday = WD[d];
        for (const p of people) {
          if (!p.days.includes(weekday)) continue;
          if (blocked.get(p.emailLocal)?.has(date)) continue;
          const def = p.pattern.kind === "fixed" ? p.pattern.shift : (week + p.pattern.offset) % 2 === 0 ? p.pattern.early : p.pattern.late;
          // Julia Hofmann: Di+Mi im Café, sonst Altstadt
          const locKey: LocKey = p.emailLocal === "hofmann" ? (weekday === "Di" || weekday === "Mi" ? "schwabing" : "altstadt") : p.locs[0];
          shifts.push({ id: cuid(), key: `shift-${++shiftCounter}`, date, weekday, startTime: def.start, endTime: def.end, breakMinutes: def.brk, team: TEAMS[p.team].name, note: def.label, employeeId: p.employeeId, locationId: ids.loc[locKey], personLocal: p.emailLocal, locKey });
        }
        // Offene (unbesetzte) Schichten
        if (weekday === "Sa") shifts.push({ id: cuid(), key: `shift-${++shiftCounter}`, date, weekday, startTime: SHIFTS.sS.start, endTime: SHIFTS.sS.end, breakMinutes: 30, team: "Service", note: "Offene Schicht – Aushilfe gesucht", employeeId: null, locationId: ids.loc.altstadt, personLocal: null, locKey: "altstadt" });
        if (weekday === "So" && week % 2 === 0) shifts.push({ id: cuid(), key: `shift-${++shiftCounter}`, date, weekday, startTime: SHIFTS.cF.start, endTime: SHIFTS.cF.end, breakMinutes: 30, team: "Café & Bar", note: "Offene Schicht – Brunch-Verstärkung", employeeId: null, locationId: ids.loc.schwabing, personLocal: null, locKey: "schwabing" });
      }
    }

    // --- ArbZG-Selbstprüfung (dieselben Regeln wie assertArbzgCompliant)
    const spanMin = (s: { startTime: string; endTime: string }) => { const [a, b] = s.startTime.split(":").map(Number); const [c, d] = s.endTime.split(":").map(Number); return c * 60 + d - (a * 60 + b); };
    for (const s of shifts) {
      const need = requiredBreakMinutes(spanMin(s), false);
      if (s.breakMinutes < need) throw new Error(`Pause zu kurz: ${s.personLocal} ${s.date}`);
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

    // --- Dateien vorbereiten (Upload vor der Transaktion)
    const bucketConfig = getStorageBucket("hrDocuments");
    type FileRow = Prisma.TenantFileCreateManyInput & { id: string };
    const files: FileRow[] = [];
    async function storeFile(input: { name: string; body: Buffer; ownerType: "tenant" | "employee"; ownerId?: string; folderSlug: string; folderName: string; documentType: string; description: string; validFrom?: string; expiresAt?: string; tags: string[]; assignedEmployee?: { id: string; name: string }; ownerName: string; uploadedBy: { id: string; name: string } }) {
      const id = cuid();
      const storageKey = buildStorageKey(bucketConfig, { tenantId, fileName: input.name, ownerType: input.ownerType, ownerId: input.ownerId });
      let provider = "s3";
      if (!SKIP_UPLOADS) {
        const uploaded = await uploadObject({ key: storageKey, body: input.body, contentType: "application/pdf", metadata: { tenantId, originalName: encodeURIComponent(input.name) } });
        provider = uploaded.provider;
      }
      files.push({
        id, tenantId, employeeId: input.ownerType === "employee" ? input.ownerId : undefined, bucket: bucketConfig.bucket, storageKey,
        originalName: input.name, displayName: input.name, mimeType: "application/pdf", sizeBytes: input.body.byteLength, extension: getFileExtension(input.name),
        folderSlug: input.folderSlug, folderName: input.folderName, ownerName: input.ownerName, uploadedById: input.uploadedBy.id, uploadedByName: input.uploadedBy.name,
        documentType: input.documentType, validFrom: input.validFrom ?? "", expiresAt: input.expiresAt ?? "", description: input.description, tagsJson: input.tags,
        assignedEmployeeId: input.assignedEmployee?.id ?? "", assignedEmployeeName: input.assignedEmployee?.name ?? "", provider,
      });
      return id;
    }

    const hr = who("krueger");
    const payrollPerson = who("brandt");
    console.log(`[seed] Erzeuge + lade PDFs hoch${SKIP_UPLOADS ? " (übersprungen)" : ""} …`);
    const companyDocs = [
      { name: "Hausordnung.pdf", type: "Richtlinie", desc: "Hausordnung für alle Standorte", lines: ["# 1. Arbeitsbeginn", "Bitte 10 Minuten vor Schichtbeginn umgezogen am Arbeitsplatz sein und per App einstempeln.", "# 2. Pausen", "Pausen werden in der App gestempelt. Ab 6 Stunden Arbeitszeit mindestens 30 Minuten.", "# 3. Krankmeldung", "Krankmeldung bitte sofort über die Ployo-App, AU ab dem 3. Tag hochladen.", "# 4. Urlaub", "Urlaubsanträge bitte mindestens 4 Wochen vorher in der App stellen."] },
      { name: "Hygieneplan HACCP.pdf", type: "Richtlinie", desc: "HACCP-Hygieneplan Küche und Café", lines: ["# Reinigungsplan", "Arbeitsflächen: nach jeder Nutzung", "Kühlräume: wöchentlich (Dienstag)", "# Temperaturkontrolle", "Kühlung max. 7 °C, Tiefkühlung max. -18 °C, 2x täglich dokumentieren.", "# Personalhygiene", "Belehrung nach § 43 IfSG jährlich auffrischen."] },
      { name: "Notfallplan und Ersthelfer.pdf", type: "Sonstiges", desc: "Notfallnummern, Ersthelfer und Sammelplätze", lines: ["# Notruf", "Feuerwehr / Rettungsdienst: 112", "# Ersthelfer", "Restaurant Altstadt: Elena Richter, Markus Schuster", "Café Schwabing: Can Yilmaz", "# Sammelplatz", "Jeweils vor dem Haupteingang."] },
      { name: "Speisekarte Herbst 2026.pdf", type: "Sonstiges", desc: "Aktuelle Speisekarte Restaurant Altstadt", lines: ["# Vorspeisen", "Kürbiscremesuppe – 7,50 €", "Feldsalat mit Speck – 9,80 €", "# Hauptgerichte", "Schweinebraten mit Knödel – 16,90 €", "Kässpatzn mit Röstzwiebeln – 14,50 €", "# Dessert", "Apfelstrudel mit Vanillesoße – 7,90 €"] },
    ];
    for (const doc of companyDocs) {
      await storeFile({ name: doc.name, body: await makePdf(doc.name.replace(/\.pdf$/, ""), doc.lines), ownerType: "tenant", folderSlug: "unternehmensdokumente", folderName: "Unternehmensdokumente", documentType: doc.type, description: doc.desc, tags: ["Unternehmen"], ownerName: "HR", uploadedBy: { id: hr.userId, name: hr.name } });
    }

    const contractFileIds = new Map<string, string>();
    const payrollFileIds = new Map<string, { id: string; gross: string; net: string }>();
    const compensationText = (p: (typeof people)[number]) => (p.pay.monthly ? `${euro(p.pay.monthly)} brutto / Monat` : `${euro(p.pay.hourly!)} brutto / Stunde`);
    const monthlyGross = (p: (typeof people)[number]) => p.pay.monthly ?? Math.round(p.pay.hourly! * p.hours * 4.33 * 100) / 100;
    for (const p of people) {
      const supervisor = p.team === "verwaltung" ? (p.emailLocal === "demo" ? "Gesellschafterversammlung" : "David Demo") : people.find((x) => x.team === p.team && x.isLead && x.employeeId !== p.employeeId)?.name ?? "Julia Hofmann";
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
        ownerType: "employee", ownerId: p.employeeId, folderSlug: "vertraege-vereinbarungen", folderName: "Verträge & Vereinbarungen", documentType: p.contractType, description: `Arbeitsvertrag ab ${fmtDe(p.start)}`,
        validFrom: p.start, expiresAt: p.endDate, tags: ["Vertrag"], assignedEmployee: { id: p.employeeId, name: p.name }, ownerName: "HR", uploadedBy: { id: hr.userId, name: hr.name },
      }));
      const gross = monthlyGross(p);
      const net = Math.round(gross * (gross < 604 ? 1 : 0.66) * 100) / 100;
      const payName = `Gehaltsabrechnung 2026-09 ${p.name}.pdf`;
      payrollFileIds.set(p.emailLocal, {
        id: await storeFile({
          name: payName,
          body: await makePdf(`Entgeltabrechnung September 2026 – ${p.name}`, [`Personalnummer: ${p.number}`, `Position: ${p.position}`, "# Bezüge", `Bruttoentgelt: ${euro(gross)}`, "# Abzüge", `Steuern und Sozialversicherung: ${euro(Math.round((gross - net) * 100) / 100)}`, "# Auszahlung", `Nettoentgelt: ${euro(net)}`]),
          ownerType: "employee", ownerId: p.employeeId, folderSlug: "abrechnungen", folderName: "Abrechnungen", documentType: "Gehaltsabrechnung", description: "September 2026",
          tags: ["Abrechnung"], assignedEmployee: { id: p.employeeId, name: p.name }, ownerName: "HR", uploadedBy: { id: payrollPerson.userId, name: payrollPerson.name },
        }),
        gross: euro(gross), net: euro(net),
      });
    }

    console.log("[seed] Hashe Passwörter …");
    const hashes = new Map<string, string>();
    for (const p of people) hashes.set(p.emailLocal, await hashPassword(p.password));

    // --- Rollen (4 System-Rollen aus dem kanonischen Template + 2 eigene)
    const customRole = (key: string, name: string, description: string, permissions: Record<string, PermissionLevel>): PermissionRole => {
      const audit = hasPermissionLevel(permissions.audit ?? "none", "read");
      const cap = (fn: (a: (typeof permissionAreas)[number], l: PermissionLevel) => boolean) => Object.fromEntries(permissionAreas.map((a) => [a.id, fn(a, permissions[a.id] ?? "none")]));
      return {
        id: key, key, name, description, isSystem: false, members: 0,
        appOverviewEnabled: hasPermissionLevel(permissions.shifts ?? "none", "write"),
        permissions: Object.fromEntries(permissionAreas.map((a) => [a.id, permissions[a.id] ?? "none"])) as Record<string, PermissionLevel>,
        scopes: fullPermissionScopeSet(),
        canDelete: cap((_, l) => hasPermissionLevel(l, "write")),
        canUploadFiles: cap((a, l) => a.fileRelevant && hasPermissionLevel(l, "write")),
        canEditFiles: cap((a, l) => a.fileRelevant && hasPermissionLevel(l, "write")),
        canViewFiles: cap((a, l) => a.fileRelevant && hasPermissionLevel(l, "read")),
        canViewAudit: cap(() => audit),
        shiftsLevel: emptyShiftsLevelSet(),
      };
    };
    const allAdmin = Object.fromEntries(permissionAreas.map((a) => [a.id, "admin" as PermissionLevel]));
    const roles: PermissionRole[] = [
      ...permissionRoles,
      customRole("geschaeftsfuehrung", "Geschäftsführung", "Vollzugriff auf alle Bereiche des Betriebs.", allAdmin),
      customRole("standortleitung", "Standortleitung", "Betriebsleitung der Standorte: Schichtplanung, Abwesenheiten und Zeiterfassung für alle Standorte.", {
        employees: "read", contracts: "none", employeeFiles: "read", payroll: "none", sensitiveData: "none", mutterschutz: "none",
        locations: "write", teams: "write", files: "write", vacation: "admin", sickness: "write", shifts: "admin", timeTracking: "admin", reminders: "write", audit: "none", roles: "none", settings: "none",
      }),
    ];
    const roleIds = new Map(roles.map((r) => [r.key, cuid()]));
    const roleName = (key: string) => roles.find((r) => r.key === key)!.name;

    // --- Benachrichtigungen vorbereiten
    type NotifRow = Prisma.TenantEmployeeNotificationCreateManyInput;
    const notifications: NotifRow[] = [];
    const notify = (p: (typeof people)[number], category: string, message: NotificationMessage, entityType: string, entityId: string, createdAt: Date, read: boolean) => {
      const r = renderNotification(message, "de");
      notifications.push({ tenantId, userId: p.userId, category, title: r.subject, detail: r.text, read, readAt: read ? minutes(createdAt, 90) : null, createdAt, entityType, entityId, messagePayload: message as unknown as Prisma.InputJsonValue });
    };

    // --- Zeiteinträge für vergangene Schichten
    type EntryRow = { id: string; employeeId: string; clockInAt: Date; clockOutAt: Date; shiftId: string; plannedStartAt: Date; plannedEndAt: Date; shiftLocation: string; clockInLocationId: string | null; clockInLocationName: string; source: string; autoClosed: boolean; note: string; correctedAt: Date | null; correctedBy: string; breaks: Array<{ startAt: Date; endAt: Date }> };
    const entries: EntryRow[] = [];
    const pastShifts = shifts.filter((s) => s.employeeId && publishedMondays.slice(0, 3).some((m) => s.date >= m && s.date <= addDaysIso(m, 6)) && berlin(s.date, s.endTime) < now);
    let autoClosedDone = false;
    let manualDone = false;
    for (const s of pastShifts) {
      const p = people.find((x) => x.employeeId === s.employeeId)!;
      const plannedStart = berlin(s.date, s.startTime);
      const plannedEnd = berlin(s.date, s.endTime);
      const inAt = minutes(plannedStart, randomInt(-9, 4));
      let outAt = minutes(plannedEnd, randomInt(-3, 14));
      const breaks: EntryRow["breaks"] = [];
      if (s.breakMinutes > 0 && randomInt(10) > 0) {
        const mid = minutes(plannedStart, Math.floor(spanMin(s) / 2) - 15 + randomInt(-20, 20));
        breaks.push({ startAt: mid, endAt: minutes(mid, s.breakMinutes + randomInt(0, 6)) });
      }
      let autoClosed = false; let note = ""; let correctedAt: Date | null = null; let correctedBy = ""; let source = s.locKey === "verwaltung" ? "web" : "app";
      if (!autoClosedDone && p.emailLocal === "schaefer") { autoClosed = true; outAt = plannedEnd; autoClosedDone = true; note = ""; }
      else if (!manualDone && p.emailLocal === "zimmermann") { source = "manual"; note = "Handy vergessen – nachgetragen durch Küchenchef."; correctedAt = minutes(plannedEnd, 60 * 14); correctedBy = "Markus Schuster"; manualDone = true; }
      entries.push({ id: cuid(), employeeId: p.employeeId, clockInAt: inAt, clockOutAt: outAt, shiftId: s.id, plannedStartAt: plannedStart, plannedEndAt: plannedEnd, shiftLocation: LOCATIONS[s.locKey].name, clockInLocationId: source === "app" ? s.locationId : null, clockInLocationName: source === "app" ? LOCATIONS[s.locKey].name : "", source, autoClosed, note, correctedAt, correctedBy, breaks });
    }

    // ================================================================ Transaktion
    console.log("[seed] Schreibe in die Datenbank (eine Transaktion) …");
    await prisma.$transaction(async (tx) => {
      // Nutzer + Login
      for (const p of people) {
        await tx.user.create({ data: { id: p.userId, email: p.email, name: p.name, emailVerified: true } });
        await tx.account.create({ data: { userId: p.userId, accountId: p.userId, providerId: "credential", password: hashes.get(p.emailLocal)! } });
        await tx.userPreference.create({ data: { userId: p.userId } });
      }

      // Tenant
      await tx.tenant.create({ data: { id: tenantId, slug: TENANT_SLUG, name: TENANT_NAME, country: "DE", timezone: "Europe/Berlin", size: "11-50", industry: "Hotellerie & Gastronomie", contactEmail: owner.email, plan: "business", billingCycle: "monthly" } });
      for (const r of roles) {
        await tx.tenantRole.create({ data: { id: roleIds.get(r.key)!, tenantId, key: r.key, name: r.name, description: r.description, isSystem: r.isSystem, appOverviewEnabled: r.appOverviewEnabled, permissions: { create: buildRolePermissionCreateData(r) } } });
      }
      for (const p of people) {
        await tx.tenantMembership.create({ data: { tenantId, userId: p.userId, role: p.membership, roleId: roleIds.get(p.roleKey)! } });
      }

      const companyAddress = await tx.address.create({ data: { street: "Beispielstraße", houseNumber: "12", postalCode: "80335", city: "München", country: "DE" } });
      await tx.tenantSettings.create({
        data: {
          tenantId, companyAddressId: companyAddress.id, taxId: "DE999999999", defaultLocationId: ids.loc.altstadt,
          workHours: "40 Stunden pro Woche", vacationDays: 30, shiftMinStaffing: 3, shiftBreakRule: "30-6", minRestHours: 11, maxShiftHours: 10,
          shiftPresetsJson: Object.entries(SHIFTS).map(([id, s]) => ({ id, label: s.label, start: s.start, end: s.end, pause: `${s.brk}m` })),
          defaultOpeningHoursJson: LOCATIONS.verwaltung.hours as Prisma.InputJsonValue,
          employeeNumberRequired: true, employeeNumberPrefix: "MA-",
          timeTrackingEnabled: true, timeTrackingBreaksEnabled: true, timeTrackingAutoBreakDeduction: true, timeTrackingClockInMode: "always", timeTrackingClockInLeadMinutes: 60,
          timeTrackingReminderPush: true, timeTrackingAutoClockOut: true, timeTrackingAutoClockOutAfterShiftMinutes: 60, timeTrackingAutoClockOutMaxHours: 12,
          timeTrackingQrRequired: false, timeTrackingQrRequiredClockOut: false,
        },
      });

      // Standorte
      for (const k of Object.keys(LOCATIONS) as LocKey[]) {
        const l = LOCATIONS[k];
        const addr = await tx.address.create({ data: { street: l.street, houseNumber: l.no, postalCode: l.zip, city: "München", country: "DE" } });
        const members = people.filter((p) => p.locs.includes(k) || (k === "verwaltung" && p.emailLocal === "demo"));
        const lead = k === "altstadt" ? who("hofmann") : k === "schwabing" ? who("yilmaz") : owner;
        await tx.tenantLocation.create({
          data: {
            id: ids.loc[k], tenantId, key: k, kind: l.kind, name: l.name, addressId: addr.id, employeeCount: members.length, openingHoursJson: l.hours as Prisma.InputJsonValue,
            shiftMinStaffing: l.minStaff, bundesland: BUNDESLAND, status: "active", accentClassName: l.accent,
            leadEmployeeId: null, leadName: lead.name, leadInitials: lead.initials, leadEmail: lead.email, leadPhone: `+49 151 2040 ${String(1000 + lead.i).slice(-4)}`,
            clockQrToken: generateClockQrToken(),
          },
        });
      }

      // Personalakten
      for (const p of people) {
        const locNames = p.locs.map((l) => LOCATIONS[l].name);
        const phone = `+49 151 2040 ${String(1000 + p.i).slice(-4)}`;
        const startYear = Number(p.start.slice(0, 4));
        const tenureYears = 2026 - startYear;
        await tx.tenantEmployee.create({
          data: {
            id: p.employeeId, tenant: { connect: { id: tenantId } }, key: p.key, user: { connect: { id: p.userId } }, initials: p.initials, name: p.name, employeeNumber: p.number,
            birthDate: encryptField(p.birth), birthPlace: encryptField(p.birthPlace), nationality: encryptField(p.nationality), maritalStatus: encryptField(p.marital),
            privateAddress: { create: encryptAddress(normalizeAddressInput({ street: p.street, houseNumber: p.no, postalCode: p.zip, city: p.zip.startsWith("85") ? (p.zip === "85354" ? "Freising" : "Erding") : "München", country: "DE" })) },
            workAddress: { create: encryptAddress(normalizeAddressInput({ street: LOCATIONS[p.locs[0]].street, houseNumber: LOCATIONS[p.locs[0]].no, postalCode: LOCATIONS[p.locs[0]].zip, city: "München", country: "DE" })) },
            taxId: encryptField(`${1 + (p.i % 9)}${String(4718293056 + p.i * 7919).slice(0, 10)}`),
            socialSecurityNumber: encryptField(`${String(10 + p.i).slice(-2)} ${p.birth.slice(8, 10)}${p.birth.slice(5, 7)}${p.birth.slice(2, 4)} ${p.last[0].toUpperCase().replace("Ä", "A").replace("Ö", "O").replace("Ü", "U")} ${String(100 + p.i * 3).slice(-3)}`),
            healthInsurance: encryptField(p.insurance),
            iban: encryptField("DE89 3704 0044 0532 0130 00"),
            location: locNames[0], team: TEAMS[p.team].name, role: roleName(p.roleKey), startDate: p.start, endDate: p.endDate ?? "", contract: p.contract,
            weeklyHours: `${p.hours} Std/Woche`, tenure: tenureYears <= 0 ? "unter 1 Jahr" : tenureYears === 1 ? "1 Jahr" : `${tenureYears} Jahre`, status: "active",
            email: p.email, phone, vacationTotal: p.vacation, workDaysJson: p.days,
            emergencyContactsJson: encryptField(JSON.stringify([{ id: cuid(), name: `${p.gender === "m" ? "Anna" : "Michael"} ${p.last}`, relation: p.marital === "verheiratet" ? (p.gender === "m" ? "Ehefrau" : "Ehemann") : "Elternteil", phone: `+49 160 3050 ${String(2000 + p.i).slice(-4)}`, isPrimary: true }])),
            maternityProtectionNote: "",
          },
        });
        await tx.tenantEmployeeTimeline.createMany({
          data: [
            { tenantId, employeeId: p.employeeId, title: "Mitarbeiter angelegt", tone: "success", createdAt: minutes(now, -60 * 24 * 30) },
            { tenantId, employeeId: p.employeeId, title: `Neuer Vertrag hinterlegt: Arbeitsvertrag ab ${fmtDe(p.start)}`, tone: "ink", createdAt: minutes(now, -60 * 24 * 29) },
          ],
        });
        for (const l of p.locs) await tx.tenantLocationMember.create({ data: { locationId: ids.loc[l], employeeId: p.employeeId, initials: p.initials, name: p.name } });
        if (p.emailLocal === "demo") for (const l of ["altstadt", "schwabing"] as LocKey[]) await tx.tenantLocationMember.create({ data: { locationId: ids.loc[l], employeeId: p.employeeId, initials: p.initials, name: p.name } });
      }
      await tx.tenantLocation.update({ where: { id: ids.loc.altstadt }, data: { leadEmployeeId: who("hofmann").employeeId } });
      await tx.tenantLocation.update({ where: { id: ids.loc.schwabing }, data: { leadEmployeeId: who("yilmaz").employeeId } });
      await tx.tenantLocation.update({ where: { id: ids.loc.verwaltung }, data: { leadEmployeeId: owner.employeeId } });

      // Teams
      for (const k of Object.keys(TEAMS) as TeamKey[]) {
        const t = TEAMS[k];
        await tx.tenantTeam.create({ data: { id: ids.team[k], tenantId, key: k, name: t.name, description: t.description, locations: t.locs.map((l) => LOCATIONS[l].name).join(", "), colorClassName: t.color } });
        for (const p of people.filter((x) => x.team === k)) {
          await tx.tenantTeamMember.create({ data: { teamId: ids.team[k], employeeId: p.employeeId, initials: p.initials, name: p.name, location: LOCATIONS[p.locs[0]].name, role: roleName(p.roleKey), contract: p.contract, status: "on-duty", isLead: Boolean(p.isLead) } });
        }
      }

      // Dateien, Ordner, Verträge, Abrechnungen
      await tx.tenantFileFolder.create({ data: { tenantId, scope: "tenant", name: "Unternehmensdokumente", slug: "unternehmensdokumente", path: "unternehmensdokumente", ownerName: "HR" } });
      await tx.tenantFile.createMany({ data: files });
      for (const p of people) {
        const supervisor = p.team === "verwaltung" ? (p.emailLocal === "demo" ? "Gesellschafterversammlung" : "David Demo") : people.find((x) => x.team === p.team && x.isLead && x.employeeId !== p.employeeId)?.name ?? "Julia Hofmann";
        const comp = compensationText(p);
        const fileId = contractFileIds.get(p.emailLocal)!;
        const file = files.find((f) => f.id === fileId)!;
        await tx.tenantEmployeeContract.create({
          data: {
            tenantId, employeeId: p.employeeId, fileId, title: `Arbeitsvertrag ab ${fmtDe(p.start)}`, contractType: p.contractType, status: "active",
            startDate: p.start, endDate: p.endDate ?? "", probationEndDate: addDaysIso(p.start, 182), noticePeriod: "Gesetzlich (§ 622 BGB)", position: p.position,
            department: TEAMS[p.team].name, workLocation: p.locs.map((l) => LOCATIONS[l].name).join(", "), weeklyHours: `${p.hours} Std/Woche`, compensation: encryptField(comp), vacationDays: p.vacation,
          },
        });
        await tx.tenantEmployeeContractDetails.create({
          data: {
            tenantId, employeeId: p.employeeId, linkedFileName: file.displayName as string, linkedFileMeta: `PDF · ${Math.ceil((file.sizeBytes as number) / 1024)} KB`,
            contractType: p.contractType, entryDate: p.start, exitDate: p.endDate ?? "", fixedTerm: p.endDate ? `bis ${fmtDe(p.endDate)}` : "Unbefristet", probation: "6 Monate",
            position: p.position, department: TEAMS[p.team].name, supervisor, workLocation: p.locs.map((l) => LOCATIONS[l].name).join(", "),
            parties: `${TENANT_NAME} / ${p.name}`, compensation: encryptField(comp), compensationGross: encryptField(euro(monthlyGross(p))),
            workingTime: `${p.hours} Std/Woche (${p.days.join(", ")})`, vacation: `${p.vacation} Arbeitstage`, noticePeriod: "Gesetzlich (§ 622 BGB)",
            collectiveAgreement: "Angelehnt an Manteltarifvertrag Hotel- und Gaststättengewerbe Bayern", clauses: ["Verschwiegenheit", "Belehrung nach § 43 IfSG"],
          },
        });
        const pay = payrollFileIds.get(p.emailLocal)!;
        await tx.tenantPayrollStatement.create({ data: { tenantId, employeeId: p.employeeId, fileId: pay.id, period: "September 2026", issuedAt: berlin("2026-09-30", "10:00"), gross: encryptField(pay.gross), net: encryptField(pay.net), status: "available" } });
      }

      // Schichten + Wochen
      await tx.tenantShift.createMany({ data: shifts.map((s) => ({ id: s.id, tenantId, key: s.key, date: s.date, weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, breakMinutes: s.breakMinutes, team: s.team, note: s.note, employeeId: s.employeeId, locationId: s.locationId, createdAt: minutes(now, -60 * 24 * 30), updatedAt: minutes(now, -60 * 24 * 30) })) });
      for (const monday of publishedMondays) {
        const { year, week } = isoWeek(monday);
        const sunday = addDaysIso(monday, 6);
        const inWeek = shifts.filter((s) => s.date >= monday && s.date <= sunday);
        const counts: Record<string, number> = {};
        for (const s of inWeek) if (s.employeeId) counts[s.employeeId] = (counts[s.employeeId] ?? 0) + 1;
        const publishedAt = berlin(addDaysIso(monday, -10), "14:00");
        const effectivePublishedAt = publishedAt > now ? now : publishedAt;
        await tx.tenantShiftWeek.create({
          data: {
            tenantId, year, week, status: "published", publishedAt: effectivePublishedAt, publishedBy: who("hofmann").userId, employeeShiftCountsJson: counts,
            publishedShiftsJson: inWeek.map((s) => ({ id: s.id, key: s.key, employeeId: s.employeeId, locationId: s.locationId, team: s.team, weekday: s.weekday, date: s.date, startTime: s.startTime, endTime: s.endTime, time: `${s.startTime} – ${s.endTime}`, location: LOCATIONS[s.locKey].name, locationAccentClassName: LOCATIONS[s.locKey].accent, note: s.note, breakMinutes: s.breakMinutes })),
          },
        });
        const weekRange = `${fmtDe(monday).slice(0, 5)}-${fmtDe(sunday)}`;
        for (const p of people) {
          const mine = inWeek.filter((s) => s.employeeId === p.employeeId);
          if (!mine.length) continue;
          notify(p, "shift", { key: "shiftPlanPublished", tenantName: TENANT_NAME, week, weekRange, shifts: mine.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime })) }, "shift-week", `${year}-W${pad2(week)}`, effectivePublishedAt, monday < currentMonday);
        }
      }
      await tx.tenantShiftTemplate.create({ data: { tenantId, name: "Standardwoche Restaurant Altstadt", entriesJson: (["Di", "Mi", "Do", "Fr", "Sa", "So"] as Weekday[]).flatMap((w) => [SHIFTS.kF, SHIFTS.kS, SHIFTS.sF, SHIFTS.sS].map((s) => ({ weekday: w, startTime: s.start, endTime: s.end, breakMinutes: s.brk, team: s.label.startsWith("Küche") ? "Küche" : "Service", locationId: ids.loc.altstadt }))) } });
      await tx.tenantShiftTemplate.create({ data: { tenantId, name: "Standardwoche Café Schwabing", entriesJson: WD.flatMap((w) => [SHIFTS.cF, SHIFTS.cS].map((s) => ({ weekday: w, startTime: s.start, endTime: s.end, breakMinutes: s.brk, team: "Café & Bar", locationId: ids.loc.schwabing }))) } });

      // Urlaub
      let vacN = 0;
      for (const v of VACATIONS) {
        const p = who(v.who);
        const id = cuid();
        const days = calculateVacationWorkDays(v.start, v.end, new Set(p.days), BUNDESLAND);
        const createdAt = v.start < today ? berlin(addDaysIso(v.start, -35), "09:15") : minutes(now, -60 * 24 * (3 + (vacN % 9)));
        const decidedAt = v.status === "pending" ? null : minutes(createdAt, 60 * 26);
        await tx.tenantVacationRequest.create({ data: { id, tenantId, employeeId: p.employeeId, key: `urlaub-${++vacN}`, startDate: v.start, endDate: v.end, days, status: v.status, note: v.note, decidedAt, decidedBy: v.decidedBy ?? "", createdAt } });
        if (v.status !== "pending") notify(p, "vacation", { key: "vacationDecided", tenantName: TENANT_NAME, startDate: v.start, endDate: v.end, status: v.status }, "vacation-request", id, decidedAt!, v.start < today);
      }

      // Krankheit
      for (const s of SICKNESS) {
        const p = who(s.who);
        await tx.tenantSicknessReport.create({ data: { tenantId, employeeId: p.employeeId, startDate: berlin(s.start, "00:00"), endDate: berlin(s.end, "00:00"), status: s.status, certificateStatus: s.cert, reportChannel: s.channel, note: encryptField(s.note), reportedById: s.channel === "app" ? p.userId : hr.userId, reportedByName: s.channel === "app" ? p.name : hr.name, closedAt: s.status === "closed" ? berlin(addDaysIso(s.end, 1), "09:00") : null, createdAt: berlin(s.start, "07:12") } });
      }

      // Wunschfrei
      let wishN = 0;
      for (const w of WISHES) {
        const p = who(w.who);
        const id = cuid();
        const createdAt = minutes(now, -60 * 24 * (4 + wishN));
        const decidedAt = w.status === "open" ? null : minutes(createdAt, 60 * 20);
        await tx.tenantWishFreeRequest.create({ data: { id, tenantId, employeeId: p.employeeId, key: `wunschfrei-${++wishN}`, date: w.date, status: w.status, reason: w.reason, rejectReason: w.rejectReason ?? "", decidedAt, decidedBy: w.decidedBy ?? "", createdAt } });
        if (w.status !== "open") notify(p, "shift", { key: "wishFreeDecided", tenantName: TENANT_NAME, date: w.date, status: w.status === "approved" ? "approved" : "rejected", rejectReason: w.rejectReason ?? "" }, "wish-free-request", id, decidedAt!, false);
      }

      // Erinnerungen
      const reminders = [
        { title: "Temperaturprotokoll Kühlhaus prüfen", subject: "HACCP-Dokumentation September/Oktober vollständig?", category: "Hygiene", due: addDaysIso(today, 3), priority: "urgent", team: "kueche" },
        { title: "Folgebelehrung § 43 IfSG Küche", subject: "Jährliche Hygienebelehrung für das gesamte Küchenteam", category: "Hygiene", due: "2026-10-30", priority: "important", team: "kueche" },
        { title: "Befristung Marie Wolf läuft aus", subject: "Werkstudentenvertrag endet am 15.11.2026 – Verlängerung klären", category: "Vertrag", due: "2026-11-01", priority: "important", team: "service" },
        { title: "Lohnabrechnung Oktober an Steuerbüro", subject: "Stundenreport Oktober exportieren und versenden", category: "Lohn", due: "2026-11-03", priority: "important", team: "verwaltung" },
        { title: "Feuerlöscher-Wartung Café Schwabing", subject: "Termin mit Wartungsfirma vereinbaren", category: "Arbeitssicherheit", due: "2026-11-12", priority: "normal", team: "cafe" },
        { title: "Dienstplan Dezember / Weihnachtsgeschäft", subject: "Urlaubssperre und Zusatzschichten für Weihnachtsfeiern planen", category: "Planung", due: "2026-11-20", priority: "normal", team: "service" },
        { title: "Weihnachtsfeier organisieren", subject: "Location, Termin und Budget abstimmen", category: "Allgemein", due: "2026-11-27", priority: "normal", team: "verwaltung" },
        { title: "Erste-Hilfe-Auffrischung", subject: "Ersthelfer-Kurs für Elena Richter und Can Yilmaz", category: "Arbeitssicherheit", due: "2026-09-30", priority: "normal", team: "verwaltung", done: true },
      ] as const;
      let remN = 0;
      for (const r of reminders) {
        await tx.tenantReminder.create({ data: { tenantId, key: `erinnerung-${++remN}`, title: r.title, subject: r.subject, category: r.category, dueDate: r.due, priority: r.priority, status: "done" in r ? "done" : "open", completedAt: "done" in r ? berlin("2026-09-28", "11:00") : null, createdById: hr.userId, createdByName: hr.name, teamId: ids.team[r.team], createdAt: minutes(now, -60 * 24 * (10 + remN)) } });
      }

      // Info-Anfragen
      const infoRequests = [
        { who: "hartung", title: "Berufsschulzeugnis Halbjahr", message: "Bitte lade dein aktuelles Berufsschulzeugnis hoch.", due: "2026-10-31", file: true },
        { who: "wolf", title: "Immatrikulationsbescheinigung Wintersemester", message: "Für den Werkstudentenstatus brauchen wir die aktuelle Bescheinigung.", due: "2026-10-20", file: true },
        { who: "zimmermann", title: "Nachweis Befreiung Rentenversicherungspflicht", message: "Bitte den unterschriebenen Befreiungsantrag (Minijob) hochladen.", due: "2026-10-25", file: true },
        { who: "neumann", title: "Neue Adresse bestätigen", message: "Du hast einen Umzug erwähnt – bitte neue Anschrift mitteilen.", due: null, file: false },
      ];
      let infoN = 0;
      for (const r of infoRequests) {
        const p = who(r.who);
        const id = cuid();
        const createdAt = minutes(now, -60 * 24 * (2 + infoN++));
        await tx.tenantEmployeeInfoRequest.create({ data: { id, tenantId, employeeId: p.employeeId, title: r.title, message: r.message, requestedBy: hr.name, dueAt: r.due ? berlin(r.due, "23:59") : null, fileRequested: r.file, status: "open", createdAt } });
        notify(p, "system", { key: "infoRequest", tenantName: TENANT_NAME, title: r.title, dueAt: r.due ? berlin(r.due, "23:59") : null }, "info-request", id, createdAt, false);
      }

      // Zeiterfassung
      for (const e of entries) {
        await tx.tenantTimeEntry.create({ data: { id: e.id, tenantId, employeeId: e.employeeId, clockInAt: e.clockInAt, clockOutAt: e.clockOutAt, shiftId: e.shiftId, plannedStartAt: e.plannedStartAt, plannedEndAt: e.plannedEndAt, shiftLocation: e.shiftLocation, clockInLocationId: e.clockInLocationId, clockInLocationName: e.clockInLocationName, source: e.source, autoClosed: e.autoClosed, note: e.note, correctedAt: e.correctedAt, correctedBy: e.correctedBy, createdAt: e.clockInAt } });
        if (e.breaks.length) await tx.tenantTimeBreak.createMany({ data: e.breaks.map((b) => ({ timeEntryId: e.id, startAt: b.startAt, endAt: b.endAt })) });
      }

      // Benachrichtigungen, Standort-Aktivitäten, Audit
      await tx.tenantEmployeeNotification.createMany({ data: notifications });
      await tx.tenantLocationActivity.createMany({
        data: [
          { tenantId, locationId: ids.loc.altstadt, actor: "Julia Hofmann", text: "Schichtplan für die nächsten Wochen veröffentlicht", tone: "success", createdAt: minutes(now, -60 * 24 * 3) },
          { tenantId, locationId: ids.loc.altstadt, actor: "Markus Schuster", text: "Neue Kühlzelle in Betrieb genommen", tone: "ink", createdAt: minutes(now, -60 * 24 * 12) },
          { tenantId, locationId: ids.loc.schwabing, actor: "Can Yilmaz", text: "Öffnungszeiten am Wochenende auf 07:30 Uhr vorgezogen", tone: "ink", createdAt: minutes(now, -60 * 24 * 8) },
          { tenantId, locationId: ids.loc.verwaltung, actor: "Sabine Krüger", text: "Stempel-QR-Codes für alle Standorte erzeugt", tone: "success", createdAt: minutes(now, -60 * 24 * 15) },
        ],
      });
      await tx.tenantAuditLog.create({ data: { tenantId, actorId: "", actorName: "System (Demo-Daten)", action: "Demo-Betrieb angelegt", source: "Seed", entityType: "tenant", entityId: tenantId, detail: "Demo-Betrieb für Google-Play-Tests mit 20 Testkonten angelegt." } });
    }, { timeout: 300_000, maxWait: 20_000 });

    // --- Ausgabe
    writeFileSync(OUT, JSON.stringify({
      tenant: { id: tenantId, slug: TENANT_SLUG, name: TENANT_NAME },
      weeks: { published: publishedMondays.map((m) => ({ monday: m, ...isoWeek(m) })), draft: draftMondays.map((m) => ({ monday: m, ...isoWeek(m) })) },
      counts: { shifts: shifts.length, openShifts: shifts.filter((s) => !s.employeeId).length, timeEntries: entries.length, files: files.length, notifications: notifications.length },
      accounts: people.map((p) => ({
        nr: p.i + 1, name: p.name, email: p.email, password: p.password, membership: p.membership, role: roleName(p.roleKey), position: p.position,
        team: TEAMS[p.team].name, locations: p.locs.map((l) => LOCATIONS[l].name), contract: p.contract, hours: p.hours, days: p.days, number: p.number,
        shiftsUpcoming: shifts.filter((s) => s.employeeId === p.employeeId && s.date > today && s.date <= addDaysIso(currentMonday, 7 * 6 - 1)).length,
        tester: p.tester,
      })),
    }, null, 2), { mode: 0o600 });
    console.log(`[seed] Fertig. Tenant ${tenantId}, ${shifts.length} Schichten, ${entries.length} Zeiteinträge, ${files.length} Dateien. Zugangsdaten: ${OUT}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
