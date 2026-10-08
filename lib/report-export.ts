import "server-only";
import { crc32, deflateRawSync } from "node:zlib";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { minutesToDecimalHours, type AbsencePeriod } from "@/lib/report-hours";

/**
 * Datei-Ausgabe der Stunden-Reports (lib/reports-service.ts): Excel (.xlsx)
 * und PDF.
 *
 * Die XLSX-Datei wird bewusst ohne Tabellen-Bibliothek geschrieben — das
 * Format ist ein ZIP mit ein paar XML-Dateien, und für eine einzelne
 * Tabelle reichen Node-Bordmittel (`zlib.deflateRawSync`/`zlib.crc32`).
 * Die gängigen Bibliotheken (exceljs, SheetJS) ziehen einen großen, teils
 * nicht mehr gepflegten Abhängigkeitsbaum mit, der für diesen Zweck in
 * keinem Verhältnis steht.
 */

export type ReportExportRow = {
  name: string;
  employeeNumber: string;
  plannedMinutes: number;
  workedMinutes: number;
  nightMinutes: number;
  holidayMinutes: number;
  sundayMinutes: number;
  /** null = keine Berechtigung, Spalte bleibt leer. */
  vacations: AbsencePeriod[] | null;
  sickness: AbsencePeriod[] | null;
  /** Manuell angepasste Spalten (für den Hinweis in der Datei). */
  adjusted: string[];
};

export type ReportExportInput = {
  tenantName: string;
  title: string;
  /** z. B. "01.10.2026 – 31.10.2026" */
  rangeLabel: string;
  /** z. B. "Team: Küche" */
  selectionLabel: string;
  nightLabel: string;
  generatedLabel: string;
  rows: ReportExportRow[];
  showVacation: boolean;
  showSickness: boolean;
};

const COLUMN_LABELS = {
  name: "Mitarbeiter",
  employeeNumber: "Personalnummer",
  planned: "Soll-Std. (Schichtplan)",
  worked: "Ist-Std. (Zeiterfassung)",
  night: "davon Nacht",
  holiday: "davon Feiertag",
  sunday: "davon Sonntag",
  vacationDays: "Urlaubstage",
  vacationPeriods: "Urlaub (Zeitraum)",
  sicknessDays: "Krankheitstage",
  sicknessPeriods: "Krankheit (Zeitraum)",
  note: "Hinweis",
  total: "Summe",
} as const;

export function formatIsoDateDe(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

function formatShortDateDe(date: string) {
  const [, month, day] = date.split("-");
  return `${day}.${month}.`;
}

/** "01.10.–03.10. (3)" bzw. "seit 05.10. (offen, 3)" */
export function formatAbsencePeriods(periods: AbsencePeriod[]): string {
  return periods
    .map((period) => {
      const range =
        period.from === period.to
          ? formatShortDateDe(period.from)
          : `${formatShortDateDe(period.from)}–${formatShortDateDe(period.to)}`;
      return `${range} (${period.open ? "offen, " : ""}${period.days} T.)`;
    })
    .join(", ");
}

function sumDays(periods: AbsencePeriod[] | null) {
  return (periods ?? []).reduce((sum, period) => sum + period.days, 0);
}

function decimalDe(minutes: number) {
  return minutesToDecimalHours(minutes).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function totals(rows: ReportExportRow[]) {
  const sum = (pick: (row: ReportExportRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  return {
    plannedMinutes: sum((row) => row.plannedMinutes),
    workedMinutes: sum((row) => row.workedMinutes),
    nightMinutes: sum((row) => row.nightMinutes),
    holidayMinutes: sum((row) => row.holidayMinutes),
    sundayMinutes: sum((row) => row.sundayMinutes),
    vacationDays: sum((row) => sumDays(row.vacations)),
    sicknessDays: sum((row) => sumDays(row.sickness)),
  };
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // In XML 1.0 unzulässige Steuerzeichen würden die Datei für Excel unlesbar machen.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function columnLetter(index: number) {
  let result = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

type Cell = { value: string | number | null; style?: number };

/** Style-IDs aus `stylesXml`: 0 normal, 1 fett, 2 Zahl 0.00, 3 fett + Zahl 0.00, 4 Titel. */
const STYLE = { text: 0, bold: 1, number: 2, boldNumber: 3, title: 4 } as const;

function cellXml(cell: Cell, ref: string) {
  if (cell.value === null || cell.value === "") return "";
  const style = cell.style ? ` s="${cell.style}"` : "";

  if (typeof cell.value === "number") {
    return `<c r="${ref}"${style}><v>${cell.value}</v></c>`;
  }

  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
}

function sheetXml(rows: Cell[][], columnWidths: number[], freezeRow: number) {
  const cols = columnWidths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const body = rows
    .map((row, rowIndex) => {
      const cells = row.map((cell, columnIndex) => cellXml(cell, `${columnLetter(columnIndex)}${rowIndex + 1}`)).join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Stundenreport" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

/** Minimaler ZIP-Writer (Deflate, ohne Zip64) — reicht für ein paar kleine XML-Dateien. */
export function createZip(files: Array<{ name: string; data: Buffer }>, now = new Date()): Buffer {
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const compressed = deflateRawSync(file.data);
    const checksum = crc32(file.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8-Dateinamen
    local.writeUInt16LE(8, 8); // Deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function buildReportXlsx(input: ReportExportInput): Buffer {
  const header: Cell[] = [
    { value: COLUMN_LABELS.name, style: STYLE.bold },
    { value: COLUMN_LABELS.employeeNumber, style: STYLE.bold },
    { value: COLUMN_LABELS.planned, style: STYLE.bold },
    { value: COLUMN_LABELS.worked, style: STYLE.bold },
    { value: COLUMN_LABELS.night, style: STYLE.bold },
    { value: COLUMN_LABELS.holiday, style: STYLE.bold },
    { value: COLUMN_LABELS.sunday, style: STYLE.bold },
  ];
  const widths = [28, 16, 14, 14, 12, 14, 14];

  if (input.showVacation) {
    header.push({ value: COLUMN_LABELS.vacationDays, style: STYLE.bold }, { value: COLUMN_LABELS.vacationPeriods, style: STYLE.bold });
    widths.push(12, 36);
  }
  if (input.showSickness) {
    header.push({ value: COLUMN_LABELS.sicknessDays, style: STYLE.bold }, { value: COLUMN_LABELS.sicknessPeriods, style: STYLE.bold });
    widths.push(14, 36);
  }
  header.push({ value: COLUMN_LABELS.note, style: STYLE.bold });
  widths.push(36);

  const hours = (minutes: number, style: number = STYLE.number): Cell => ({ value: minutesToDecimalHours(minutes), style });
  const dataRows: Cell[][] = input.rows.map((row) => {
    const cells: Cell[] = [
      { value: row.name },
      { value: row.employeeNumber },
      hours(row.plannedMinutes),
      hours(row.workedMinutes),
      hours(row.nightMinutes),
      hours(row.holidayMinutes),
      hours(row.sundayMinutes),
    ];
    if (input.showVacation) {
      cells.push({ value: sumDays(row.vacations) }, { value: formatAbsencePeriods(row.vacations ?? []) });
    }
    if (input.showSickness) {
      cells.push({ value: sumDays(row.sickness) }, { value: formatAbsencePeriods(row.sickness ?? []) });
    }
    cells.push({ value: row.adjusted.length > 0 ? `Manuell angepasst: ${row.adjusted.join(", ")}` : "" });
    return cells;
  });

  const sum = totals(input.rows);
  const totalRow: Cell[] = [
    { value: COLUMN_LABELS.total, style: STYLE.bold },
    { value: "" },
    hours(sum.plannedMinutes, STYLE.boldNumber),
    hours(sum.workedMinutes, STYLE.boldNumber),
    hours(sum.nightMinutes, STYLE.boldNumber),
    hours(sum.holidayMinutes, STYLE.boldNumber),
    hours(sum.sundayMinutes, STYLE.boldNumber),
  ];
  if (input.showVacation) totalRow.push({ value: sum.vacationDays, style: STYLE.bold }, { value: "" });
  if (input.showSickness) totalRow.push({ value: sum.sicknessDays, style: STYLE.bold }, { value: "" });

  const rows: Cell[][] = [
    [{ value: `${input.title} – ${input.tenantName}`, style: STYLE.title }],
    [{ value: `Zeitraum: ${input.rangeLabel}` }],
    [{ value: `Auswahl: ${input.selectionLabel}` }],
    [{ value: `${input.nightLabel} · Stunden in Dezimalstunden · ${input.generatedLabel}` }],
    [],
    header,
    ...dataRows,
    totalRow,
  ];

  return createZip([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypesXml) },
    { name: "_rels/.rels", data: Buffer.from(rootRelsXml) },
    { name: "xl/workbook.xml", data: Buffer.from(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(workbookRelsXml) },
    { name: "xl/styles.xml", data: Buffer.from(stylesXml) },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheetXml(rows, widths, 6)) },
  ]);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/**
 * Die Standardschrift (Helvetica, WinAnsi) kennt Umlaute/ß/€, aber z. B.
 * keine typografischen Sonderzeichen außerhalb von Windows-1252 — die
 * würden beim Zeichnen werfen. Daher vorher ersetzen.
 */
function pdfSafe(font: PDFFont, text: string) {
  return Array.from(text.replace(/[–—]/g, "-").replace(/−/g, "-"))
    .map((char) => {
      try {
        font.encodeText(char);
        return char;
      } catch {
        return "?";
      }
    })
    .join("");
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = pdfSafe(font, text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  return lines.length > 0 ? lines : [""];
}

export async function buildReportPdf(input: ReportExportInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.title} – ${input.tenantName}`);
  pdf.setProducer("Ployo");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 841.89; // A4 quer
  const pageHeight = 595.28;
  const margin = 36;
  const fontSize = 8;
  const lineHeight = 10;
  const ink = rgb(0.1, 0.1, 0.09);
  const muted = rgb(0.43, 0.43, 0.42);
  const rule = rgb(0.85, 0.85, 0.83);

  type Column = { label: string; width: number; align: "left" | "right"; value: (row: ReportExportRow) => string };
  const columns: Column[] = [
    { label: COLUMN_LABELS.name, width: 120, align: "left", value: (row) => row.name },
    { label: "Pers.-Nr.", width: 54, align: "left", value: (row) => row.employeeNumber },
    { label: "Soll", width: 44, align: "right", value: (row) => decimalDe(row.plannedMinutes) },
    { label: "Ist", width: 44, align: "right", value: (row) => decimalDe(row.workedMinutes) },
    { label: "Nacht", width: 40, align: "right", value: (row) => decimalDe(row.nightMinutes) },
    { label: "Feiertag", width: 42, align: "right", value: (row) => decimalDe(row.holidayMinutes) },
    { label: "Sonntag", width: 42, align: "right", value: (row) => decimalDe(row.sundayMinutes) },
  ];
  const fixedWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const absenceColumns = Number(input.showVacation) + Number(input.showSickness);
  const flexibleWidth = pageWidth - 2 * margin - fixedWidth;
  const absenceWidth = absenceColumns > 0 ? flexibleWidth / absenceColumns : 0;

  if (input.showVacation) {
    columns.push({
      label: "Urlaub",
      width: absenceWidth,
      align: "left",
      value: (row) => (row.vacations && row.vacations.length > 0 ? formatAbsencePeriods(row.vacations) : "-"),
    });
  }
  if (input.showSickness) {
    columns.push({
      label: "Krankheit",
      width: absenceWidth,
      align: "left",
      value: (row) => (row.sickness && row.sickness.length > 0 ? formatAbsencePeriods(row.sickness) : "-"),
    });
  }

  let page: PDFPage = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawCell = (text: string, x: number, width: number, align: "left" | "right", rowY: number, cellFont: PDFFont) => {
    const lines = wrapText(cellFont, text, fontSize, width - 6);
    lines.forEach((line, index) => {
      const textWidth = cellFont.widthOfTextAtSize(line, fontSize);
      const drawX = align === "right" ? x + width - 3 - textWidth : x + 3;
      page.drawText(line, { x: drawX, y: rowY - (index + 1) * lineHeight + 2, size: fontSize, font: cellFont, color: ink });
    });
    return lines.length;
  };

  const drawHeader = () => {
    page.drawText(pdfSafe(bold, `${input.title} – ${input.tenantName}`), { x: margin, y: y - 14, size: 14, font: bold, color: ink });
    y -= 28;
    for (const line of [
      `Zeitraum: ${input.rangeLabel}   ·   Auswahl: ${input.selectionLabel}`,
      `${input.nightLabel}   ·   Stunden in Dezimalstunden   ·   ${input.generatedLabel}`,
    ]) {
      page.drawText(pdfSafe(font, line), { x: margin, y: y - 9, size: 8.5, font, color: muted });
      y -= 12;
    }
    y -= 8;

    let x = margin;
    const headerLines = Math.max(...columns.map((column) => wrapText(bold, column.label, fontSize, column.width - 6).length));
    for (const column of columns) {
      drawCell(column.label, x, column.width, column.align, y, bold);
      x += column.width;
    }
    y -= headerLines * lineHeight + 4;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.8, color: ink });
    y -= 2;
  };

  drawHeader();

  const drawRow = (values: string[], rowFont: PDFFont) => {
    const lineCount = Math.max(...columns.map((column, index) => wrapText(rowFont, values[index], fontSize, column.width - 6).length));
    const rowHeight = lineCount * lineHeight + 4;

    if (y - rowHeight < margin + 14) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      drawHeader();
    }

    let x = margin;
    columns.forEach((column, index) => {
      drawCell(values[index], x, column.width, column.align, y - 2, rowFont);
      x += column.width;
    });
    y -= rowHeight;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.4, color: rule });
  };

  for (const row of input.rows) {
    const values = columns.map((column) => column.value(row));
    if (row.adjusted.length > 0) values[0] = `${values[0]} *`;
    drawRow(values, font);
  }

  const sum = totals(input.rows);
  const totalValues = [
    COLUMN_LABELS.total,
    "",
    decimalDe(sum.plannedMinutes),
    decimalDe(sum.workedMinutes),
    decimalDe(sum.nightMinutes),
    decimalDe(sum.holidayMinutes),
    decimalDe(sum.sundayMinutes),
  ];
  if (input.showVacation) totalValues.push(`${sum.vacationDays} T.`);
  if (input.showSickness) totalValues.push(`${sum.sicknessDays} T.`);
  drawRow(totalValues, bold);

  const notes: string[] = [];
  if (input.rows.some((row) => row.adjusted.length > 0)) {
    notes.push("* Werte manuell angepasst: " + input.rows
      .filter((row) => row.adjusted.length > 0)
      .map((row) => `${row.name} (${row.adjusted.join(", ")})`)
      .join("; "));
  }
  notes.push("Urlaub in Arbeitstagen, Krankheit in Kalendertagen, jeweils innerhalb des Zeitraums.");

  y -= 6;
  for (const note of notes) {
    for (const line of wrapText(font, note, 7.5, pageWidth - 2 * margin)) {
      if (y - 10 < margin) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, { x: margin, y: y - 9, size: 7.5, font, color: muted });
      y -= 10;
    }
  }

  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    const label = `Seite ${index + 1} von ${pages.length}`;
    current.drawText(label, {
      x: pageWidth - margin - font.widthOfTextAtSize(label, 7.5),
      y: margin - 18,
      size: 7.5,
      font,
      color: muted,
    });
  });

  return Buffer.from(await pdf.save());
}
