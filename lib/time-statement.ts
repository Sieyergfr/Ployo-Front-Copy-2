import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { requireTenantMembership } from "@/lib/tenant-access";
import { TIME_TRACKING_ERRORS } from "@/lib/time-tracking";
import { getMyTimeEntries } from "@/lib/time-tracking-service";

/**
 * Zeitnachweis eines Monats als PDF für den Mitarbeiter selbst ("Meine
 * Zeiten" → Zeitnachweis). Grundlage sind dieselben Daten wie
 * `GET /api/me/time-entries` — der Nachweis zeigt also genau das, was die
 * App anzeigt.
 */

export type TimeStatementFile = { filename: string; contentType: string; base64: string };

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function hm(minutes: number) {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

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

export async function createMyTimeStatement(input: { tenantSlug: string; month: string }): Promise<TimeStatementFile> {
  const match = MONTH_PATTERN.exec(input.month);

  if (!match) {
    throw new Error(TIME_TRACKING_ERRORS.invalidRange);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const from = `${match[1]}-${match[2]}-01`;
  const to = `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`;

  const view = await getMyTimeEntries({ tenantSlug: input.tenantSlug, from, to });
  const access = await requireTenantMembership(input.tenantSlug);
  const [employee, tenant] = await Promise.all([
    prisma.tenantEmployee.findFirst({
      where: { tenantId: access.tenantId, userId: access.userId },
      select: { name: true, employeeNumber: true },
    }),
    prisma.tenant.findUnique({ where: { id: access.tenantId }, select: { name: true } }),
  ]);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.45, 0.45, 0.5);
  const line = rgb(0.85, 0.85, 0.88);
  const margin = 48;
  const columns = [
    { label: "Tag", x: 0 },
    { label: "Beginn", x: 92 },
    { label: "Ende", x: 160 },
    { label: "Pause", x: 228 },
    { label: "Arbeitszeit", x: 290 },
    { label: "Soll", x: 372 },
    { label: "Hinweis", x: 430 },
  ];

  let page = pdf.addPage([595.28, 841.89]);
  let y = page.getHeight() - margin;
  const text = (value: string, x: number, size = 9, f = font, color = ink) => {
    page.drawText(pdfSafe(f, value), { x: margin + x, y, size, font: f, color });
  };
  const header = () => {
    columns.forEach((column) => text(column.label, column.x, 8, bold, muted));
    y -= 6;
    page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth() - margin, y }, thickness: 0.6, color: line });
    y -= 14;
  };

  text("Zeitnachweis", 0, 18, bold);
  y -= 22;
  text(`${MONTH_NAMES[month - 1]} ${year}`, 0, 12, font, muted);
  y -= 26;
  text(`Betrieb: ${tenant?.name ?? ""}`, 0, 10);
  y -= 14;
  text(`Mitarbeiter: ${employee?.name ?? ""}${employee?.employeeNumber ? ` (Nr. ${employee.employeeNumber})` : ""}`, 0, 10);
  y -= 14;
  text(`Zeitraum: ${String(1).padStart(2, "0")}.${match[2]}.${year} - ${lastDay}.${match[2]}.${year}`, 0, 10);
  y -= 28;
  header();

  for (const day of view.days) {
    if (!day.entries.length && !day.shifts.length) continue;

    const rows = day.entries.length ? day.entries : [null];
    rows.forEach((entry, index) => {
      if (y < margin + 60) {
        page = pdf.addPage([595.28, 841.89]);
        y = page.getHeight() - margin;
        header();
      }

      const [, mm, dd] = day.date.split("-");
      const weekday = WEEKDAYS[new Date(`${day.date}T12:00:00Z`).getUTCDay()];
      if (index === 0) text(`${weekday} ${dd}.${mm}.`, columns[0].x);
      if (entry) {
        text(entry.clockInTime, columns[1].x);
        text(entry.clockOutTime ?? (entry.isOpen ? "läuft" : "-"), columns[2].x);
        text(hm(entry.breakMinutes), columns[3].x);
        text(hm(entry.workedMinutes), columns[4].x);
        const notes = [entry.corrected ? "korrigiert" : "", entry.autoClosed ? "autom. beendet" : ""].filter(Boolean);
        if (notes.length) text(notes.join(", "), columns[6].x, 8, font, muted);
      } else {
        text("-", columns[1].x, 9, font, muted);
        text("-", columns[2].x, 9, font, muted);
        text("0:00", columns[4].x, 9, font, muted);
      }
      if (index === 0) text(hm(day.plannedMinutes), columns[5].x);
      y -= 15;
    });
  }

  if (y < margin + 70) {
    page = pdf.addPage([595.28, 841.89]);
    y = page.getHeight() - margin;
  }
  y -= 4;
  page.drawLine({ start: { x: margin, y: y + 10 }, end: { x: page.getWidth() - margin, y: y + 10 }, thickness: 0.6, color: line });
  text("Summe", columns[0].x, 9, bold);
  text(hm(view.totals.breakMinutes), columns[3].x, 9, bold);
  text(hm(view.totals.workedMinutes), columns[4].x, 9, bold);
  text(hm(view.totals.plannedMinutes), columns[5].x, 9, bold);
  y -= 16;
  text(`Differenz Ist/Soll: ${hm(view.totals.workedMinutes - view.totals.plannedMinutes)} h`, 0, 9);
  y -= 30;
  text(`Erstellt am ${new Date().toLocaleDateString("de-DE", { timeZone: view.timeZone })} mit Ployo. Angaben in Stunden:Minuten.`, 0, 8, font, muted);

  const bytes = await pdf.save();
  const safeName = (employee?.name ?? "Mitarbeiter").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");

  return {
    filename: `Zeitnachweis_${safeName}_${input.month}.pdf`,
    contentType: "application/pdf",
    base64: Buffer.from(bytes).toString("base64"),
  };
}
