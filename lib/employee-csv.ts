/**
 * CSV-Import der Mitarbeiterliste (neues Design, "Importieren"). Rein und ohne
 * Abhängigkeiten, läuft im Browser: erkennt Trennzeichen (; oder ,),
 * Anführungszeichen, eine BOM und deutsche/englische Spaltennamen. Datumswerte
 * im Format TT.MM.JJJJ werden nach JJJJ-MM-TT umgewandelt.
 */
export type EmployeeCsvRow = {
  firstName: string;
  lastName: string;
  email: string;
  employeeNumber: string;
  location: string;
  team: string;
  contract: string;
  weeklyHours: string;
  startDate: string;
};

type Field = keyof EmployeeCsvRow;

const headerAliases: Record<Field, string[]> = {
  firstName: ["vorname", "firstname", "first name", "given name"],
  lastName: ["nachname", "lastname", "last name", "surname", "familienname"],
  email: ["e-mail", "email", "mail", "e-mail-adresse"],
  employeeNumber: ["personalnummer", "personalnr", "employee number", "employeenumber", "nr"],
  location: ["standort", "location", "filiale"],
  team: ["team", "abteilung"],
  contract: ["beschäftigung", "beschaeftigung", "vertrag", "vertragsart", "contract", "employment"],
  weeklyHours: ["wochenstunden", "stunden", "weekly hours", "hours"],
  startDate: ["eintritt", "eintrittsdatum", "start", "start date", "startdate"],
};

export const MAX_IMPORT_ROWS = 500;

function splitLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());

  return cells;
}

function normalizeDate(value: string) {
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);

  if (german) {
    return `${german[3]}-${german[2].padStart(2, "0")}-${german[1].padStart(2, "0")}`;
  }

  return value;
}

export function parseEmployeeCsv(text: string): {
  rows: EmployeeCsvRow[];
  error?: "empty" | "noHeader" | "tooMany";
} {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return { rows: [], error: "empty" };
  }

  const delimiter = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitLine(lines[0], delimiter).map((cell) => cell.toLowerCase());
  const columns = new Map<Field, number>();

  for (const [field, aliases] of Object.entries(headerAliases) as Array<[Field, string[]]>) {
    const index = header.findIndex((cell) => aliases.includes(cell));

    if (index >= 0) columns.set(field, index);
  }

  if (!columns.has("firstName") && !columns.has("lastName")) {
    return { rows: [], error: "noHeader" };
  }

  if (lines.length - 1 > MAX_IMPORT_ROWS) {
    return { rows: [], error: "tooMany" };
  }

  const rows = lines.slice(1).map((line) => {
    const cells = splitLine(line, delimiter);
    const value = (field: Field) => {
      const index = columns.get(field);

      return index === undefined ? "" : (cells[index] ?? "");
    };

    return {
      firstName: value("firstName"),
      lastName: value("lastName"),
      email: value("email"),
      employeeNumber: value("employeeNumber"),
      location: value("location"),
      team: value("team"),
      contract: value("contract"),
      weeklyHours: value("weeklyHours"),
      startDate: normalizeDate(value("startDate")),
    };
  });

  return { rows: rows.filter((row) => row.firstName || row.lastName) };
}
