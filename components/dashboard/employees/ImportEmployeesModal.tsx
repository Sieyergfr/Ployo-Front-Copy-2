"use client";

import {
  importEmployeesAction,
  type EmployeeImportResult,
  type EmployeeImportRow,
} from "@/app/(dashboard)/u/[tenant]/employees/actions";
import { DbModal, dbInputClass } from "@/components/dashboard/DbDrawer";
import { DbCtaButton, DbSecondaryButton } from "@/components/dashboard/ui";
import { parseEmployeeCsv } from "@/lib/employee-csv";
import { Download, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

const initialState: EmployeeImportResult = {};

/** Vorlage mit den erkannten Spalten (Semikolon, wie Excel in DE speichert). */
const TEMPLATE =
  "Vorname;Nachname;E-Mail;Personalnummer;Standort;Team;Beschäftigung;Wochenstunden;Eintritt\nLea;Hoffmann;lea.hoffmann@beispiel.de;;Filiale Mitte;Service;Teilzeit;20;01.11.2026\n";

export default function ImportEmployeesModal({ tenant }: { tenant: string }) {
  const t = useTranslations("EmployeesUi.import");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<EmployeeImportRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [state, formAction, isPending] = useActionState(importEmployeesAction, initialState);

  async function onFile(file: File | undefined) {
    setParseError("");
    setRows([]);

    if (!file) return;

    const result = parseEmployeeCsv(await file.text());

    if (result.error) {
      setParseError(t(`errors.${result.error}`));
      return;
    }

    setRows(result.rows);
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${TEMPLATE}`)}`;

  return (
    <>
      <DbSecondaryButton onClick={() => setOpen(true)}>
        <Upload size={15} />
        {t("button")}
      </DbSecondaryButton>
      {open && (
        <DbModal title={t("title")} subtitle={t("subtitle")} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-4">
            <a href={templateHref} download="mitarbeiter-vorlage.csv" className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-[#6b4fc4] no-underline">
              <Download size={14} />
              {t("template")}
            </a>
            <input type="file" accept=".csv,text/csv" onChange={(event) => onFile(event.target.files?.[0])} className={dbInputClass} />
            {parseError && <p className="m-0 text-[13px] text-[#b4332a]">{parseError}</p>}
            {rows.length > 0 && !state.created && (
              <div className="max-h-[260px] overflow-auto rounded-[10px] border border-[#ecebe7]">
                <table className="w-full border-collapse text-left text-[12.5px]">
                  <thead className="bg-[#fafaf8] text-[#6e6e6b]">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t("name")}</th>
                      <th className="px-3 py-2 font-medium">{t("email")}</th>
                      <th className="px-3 py-2 font-medium">{t("assignment")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((row, index) => (
                      <tr key={index} className="border-t border-[#f0efeb]">
                        <td className="px-3 py-1.5">{`${row.firstName} ${row.lastName}`.trim()}</td>
                        <td className="px-3 py-1.5">{row.email}</td>
                        <td className="px-3 py-1.5">{[row.location, row.team].filter(Boolean).join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {state.error && <p className="m-0 text-[13px] text-[#b4332a]">{state.error}</p>}
            {state.created !== undefined && (
              <div className="rounded-[12px] bg-[#fafaf8] p-3 text-[13px]">
                <p className="m-0 font-semibold text-[#1f5d2c]">{t("created", { count: state.created })}</p>
                {(state.failed ?? []).length > 0 && (
                  <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-[#b4332a]">
                    {(state.failed ?? []).slice(0, 20).map((item) => (
                      <li key={item.row}>{t("failedRow", { row: item.row, name: item.name, error: item.error })}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <form action={formAction} className="flex justify-end gap-2">
              <input type="hidden" name="tenant" value={tenant} />
              <input type="hidden" name="rows" value={JSON.stringify(rows)} />
              <DbSecondaryButton onClick={() => setOpen(false)}>{t("close")}</DbSecondaryButton>
              {!state.created && (
                <DbCtaButton type="submit" disabled={isPending || rows.length === 0}>
                  <span>{isPending ? t("importing") : t("submit", { count: rows.length })}</span>
                </DbCtaButton>
              )}
            </form>
          </div>
        </DbModal>
      )}
    </>
  );
}
