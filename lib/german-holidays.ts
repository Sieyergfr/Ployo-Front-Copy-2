/**
 * Rein berechnete deutsche Feiertage (bundeseinheitlich + je Bundesland),
 * bewusst ohne DB-Tabelle — die Termine sind gesetzlich fixiert bzw. über
 * Ostern (Gauß'sche Osterformel) berechenbar, brauchen also keine jährliche
 * Pflege. Deckt nur Feiertage ab, die IMMER im gesamten Bundesland gelten;
 * kommunal unterschiedliche Feiertage (z. B. Fronleichnam in einzelnen
 * sächsischen/thüringischen Gemeinden, Mariä Himmelfahrt in überwiegend
 * katholischen bayerischen Gemeinden) werden bewusst NICHT abgebildet, weil
 * sie unterhalb der Standort-/Bundesland-Ebene liegen, die dieses Modell
 * kennt (Audit-Finding M01/M03 — Feiertagskalender fehlte bisher komplett).
 *
 * Rechtsstand 2026-09-06: Weltkindertag (Thüringen, seit 2019) und
 * Internationaler Frauentag (Mecklenburg-Vorpommern, seit 2023) sind
 * berücksichtigt. Ein neu eingeführter Feiertag muss hier manuell ergänzt
 * werden — es gibt keine automatische Rechtsänderungs-Erkennung.
 */

export type Bundesland =
  | "BW" | "BY" | "BE" | "BB" | "HB" | "HH" | "HE" | "MV"
  | "NI" | "NW" | "RP" | "SL" | "SN" | "ST" | "SH" | "TH";

export const BUNDESLAENDER: Array<{ code: Bundesland; name: string }> = [
  { code: "BW", name: "Baden-Württemberg" },
  { code: "BY", name: "Bayern" },
  { code: "BE", name: "Berlin" },
  { code: "BB", name: "Brandenburg" },
  { code: "HB", name: "Bremen" },
  { code: "HH", name: "Hamburg" },
  { code: "HE", name: "Hessen" },
  { code: "MV", name: "Mecklenburg-Vorpommern" },
  { code: "NI", name: "Niedersachsen" },
  { code: "NW", name: "Nordrhein-Westfalen" },
  { code: "RP", name: "Rheinland-Pfalz" },
  { code: "SL", name: "Saarland" },
  { code: "SN", name: "Sachsen" },
  { code: "ST", name: "Sachsen-Anhalt" },
  { code: "SH", name: "Schleswig-Holstein" },
  { code: "TH", name: "Thüringen" },
];

function formatIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Ostersonntag (gregorianisch) nach der Gaußschen Osterformel (Anonymous-Gregorian-Algorithmus). */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return { month, day };
}

/** `baseYear-baseMonth-baseDay` um `days` Tage verschieben (UTC-basiert, DST-unabhängig). */
function addDaysIso(year: number, month: number, day: number, days: number): string {
  const shifted = new Date(Date.UTC(year, month - 1, day + days));

  return formatIso(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** Buß- und Bettag: Mittwoch vor dem 23.11. (also zwischen dem 16. und 22.11.). */
function bussUndBettag(year: number): string {
  for (let day = 16; day <= 22; day += 1) {
    const weekday = new Date(Date.UTC(year, 10, day)).getUTCDay();
    if (weekday === 3) {
      return formatIso(year, 11, day);
    }
  }

  throw new Error(`Buß- und Bettag ${year} nicht gefunden — sollte unmöglich sein.`);
}

/**
 * Alle gesetzlichen Feiertage eines Kalenderjahres für ein Bundesland (oder
 * nur die neun bundeseinheitlichen, falls `bundesland` `null` ist — z. B. für
 * einen Standort ohne hinterlegtes Bundesland). Rückgabe als Map von
 * ISO-Datum auf Feiertagsname.
 */
export function getGermanHolidays(year: number, bundesland: Bundesland | null): Map<string, string> {
  const easter = easterSunday(year);
  const holidays = new Map<string, string>();

  holidays.set(formatIso(year, 1, 1), "Neujahr");
  holidays.set(addDaysIso(year, easter.month, easter.day, -2), "Karfreitag");
  holidays.set(addDaysIso(year, easter.month, easter.day, 1), "Ostermontag");
  holidays.set(formatIso(year, 5, 1), "Tag der Arbeit");
  holidays.set(addDaysIso(year, easter.month, easter.day, 39), "Christi Himmelfahrt");
  holidays.set(addDaysIso(year, easter.month, easter.day, 50), "Pfingstmontag");
  holidays.set(formatIso(year, 10, 3), "Tag der Deutschen Einheit");
  holidays.set(formatIso(year, 12, 25), "1. Weihnachtsfeiertag");
  holidays.set(formatIso(year, 12, 26), "2. Weihnachtsfeiertag");

  if (!bundesland) {
    return holidays;
  }

  if (bundesland === "BW" || bundesland === "BY" || bundesland === "ST") {
    holidays.set(formatIso(year, 1, 6), "Heilige Drei Könige");
  }

  if (bundesland === "BE" || bundesland === "MV") {
    holidays.set(formatIso(year, 3, 8), "Internationaler Frauentag");
  }

  if (
    bundesland === "BW" || bundesland === "BY" || bundesland === "HE" ||
    bundesland === "NW" || bundesland === "RP" || bundesland === "SL"
  ) {
    holidays.set(addDaysIso(year, easter.month, easter.day, 60), "Fronleichnam");
  }

  if (bundesland === "SL") {
    holidays.set(formatIso(year, 8, 15), "Mariä Himmelfahrt");
  }

  if (bundesland === "TH") {
    holidays.set(formatIso(year, 9, 20), "Weltkindertag");
  }

  if (
    bundesland === "BB" || bundesland === "HB" || bundesland === "HH" ||
    bundesland === "MV" || bundesland === "NI" || bundesland === "SN" ||
    bundesland === "ST" || bundesland === "SH" || bundesland === "TH"
  ) {
    holidays.set(formatIso(year, 10, 31), "Reformationstag");
  }

  if (
    bundesland === "BW" || bundesland === "BY" || bundesland === "NW" ||
    bundesland === "RP" || bundesland === "SL"
  ) {
    holidays.set(formatIso(year, 11, 1), "Allerheiligen");
  }

  if (bundesland === "SN") {
    holidays.set(bussUndBettag(year), "Buß- und Bettag");
  }

  return holidays;
}

/** true, wenn `dateIso` (YYYY-MM-DD) in seinem Kalenderjahr ein Feiertag für das übergebene Bundesland ist. */
export function isGermanHoliday(dateIso: string, bundesland: Bundesland | null): boolean {
  const year = Number(dateIso.slice(0, 4));

  if (!Number.isFinite(year)) {
    return false;
  }

  return getGermanHolidays(year, bundesland).has(dateIso);
}
