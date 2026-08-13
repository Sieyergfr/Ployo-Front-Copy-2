"use client";

import {
  createEmployeeContractAction,
  updateEmployeeContractStatusAction,
} from "@/app/(dashboard)/u/[tenant]/employees/actions";
import { getHrFileSignedUrlAction } from "@/app/(dashboard)/u/[tenant]/dateien/actions";
import FormSubmitButton from "@/components/FormSubmitButton";
import DatePickerField from "@/components/DatePickerField";
import { useUniversalPopup } from "@/components/UniversalPopup";
import type { ContractStatus } from "@/lib/contract-service";
import { Eye, FilePlus2, FileText, Power, XCircle } from "lucide-react";
import { useTransition } from "react";

export type EmployeeContractItem = {
  id: string;
  title: string;
  contractType: string;
  status: ContractStatus;
  startDate: string;
  endDate: string;
  probationEndDate: string;
  noticePeriod: string;
  position: string;
  department: string;
  workLocation: string;
  weeklyHours: string;
  compensation: string;
  vacationDays: number;
  terminationDate: string;
  terminationReason: string;
  notes: string;
  file: { id: string; displayName: string };
};

const statuses: Array<{ value: ContractStatus; label: string }> = [
  { value: "draft", label: "Entwurf" },
  { value: "active", label: "Aktiv" },
  { value: "terminated", label: "Gekündigt" },
  { value: "expired", label: "Abgelaufen" },
  { value: "inactive", label: "Inaktiv" },
];

function HiddenContext({ tenant, employeeId, employeeHandle }: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
}) {
  return <>
    <input type="hidden" name="tenant" value={tenant} />
    <input type="hidden" name="employeeId" value={employeeId} />
    <input type="hidden" name="employeeHandle" value={employeeHandle} />
  </>;
}

function NewContractForm({ tenant, employeeId, employeeHandle }: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
}) {
  return (
    <form action={createEmployeeContractAction} className="grid gap-4 sm:grid-cols-2">
      <HiddenContext tenant={tenant} employeeId={employeeId} employeeHandle={employeeHandle} />
      <label className="field sm:col-span-2"><span className="label">Bezeichnung</span><input className="input" name="title" placeholder="Arbeitsvertrag ab August 2026" required /></label>
      <label className="field"><span className="label">Vertragsart</span><select className="input" name="contractType" defaultValue="Arbeitsvertrag"><option>Arbeitsvertrag</option><option>Befristeter Arbeitsvertrag</option><option>Teilzeitvertrag</option><option>Änderungsvertrag</option><option>Zusatzvereinbarung</option></select></label>
      <label className="field"><span className="label">Status</span><select className="input" name="status" defaultValue="active">{statuses.slice(0, 2).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="field"><span className="label">Beginn</span><DatePickerField id="contract-start-date" name="startDate" placeholder="Vertragsbeginn auswählen" /></label>
      <label className="field"><span className="label">Ende</span><DatePickerField id="contract-end-date" name="endDate" placeholder="Optional" /></label>
      <label className="field"><span className="label">Position</span><input className="input" name="position" /></label>
      <label className="field"><span className="label">Abteilung</span><input className="input" name="department" /></label>
      <label className="field"><span className="label">Arbeitsort</span><input className="input" name="workLocation" /></label>
      <label className="field"><span className="label">Wochenstunden</span><input className="input" name="weeklyHours" placeholder="38 Std./Woche" /></label>
      <label className="field"><span className="label">Vergütung</span><input className="input" name="compensation" /></label>
      <label className="field"><span className="label">Urlaubstage</span><input className="input" type="number" min="0" name="vacationDays" /></label>
      <label className="field"><span className="label">Probezeit bis</span><DatePickerField id="contract-probation-end-date" name="probationEndDate" placeholder="Optional" /></label>
      <label className="field"><span className="label">Kündigungsfrist</span><input className="input" name="noticePeriod" /></label>
      <label className="field sm:col-span-2"><span className="label">Vertrags-PDF</span><input className="input py-2" type="file" name="contractFile" accept="application/pdf,.pdf" required /><span className="mt-1 text-[11px] text-muted">Pflichtfeld · ausschließlich PDF</span></label>
      <label className="field sm:col-span-2"><span className="label">Notiz</span><textarea className="input min-h-20 py-3" name="notes" /></label>
      <div className="sm:col-span-2 flex justify-end border-t border-border-soft pt-4"><FormSubmitButton Icon={FilePlus2} pendingLabel="Vertrag wird angelegt…">Vertrag anlegen</FormSubmitButton></div>
    </form>
  );
}

function StatusForm({ tenant, employeeId, employeeHandle, contract, target }: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
  contract: EmployeeContractItem;
  target: ContractStatus;
}) {
  return <form action={updateEmployeeContractStatusAction} className="flex flex-col gap-4">
    <HiddenContext tenant={tenant} employeeId={employeeId} employeeHandle={employeeHandle} />
    <input type="hidden" name="contractId" value={contract.id} />
    <input type="hidden" name="status" value={target} />
    <p className="text-[13px] leading-5 text-muted-2">Status von <strong className="text-ink">{contract.title}</strong> ändern.</p>
    {target === "terminated" && <><label className="field"><span className="label">Kündigung zum</span><DatePickerField id={`termination-date-${contract.id}`} name="terminationDate" placeholder="Kündigungsdatum auswählen" /></label><label className="field"><span className="label">Grund / Notiz</span><textarea className="input min-h-24 py-3" name="terminationReason" required /></label></>}
    <div className="flex justify-end border-t border-border-soft pt-4"><FormSubmitButton pendingLabel="Wird gespeichert…">Status speichern</FormSubmitButton></div>
  </form>;
}

export default function EmployeeContracts({ tenant, employeeId, employeeHandle, contracts, canManage = true }: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
  contracts: EmployeeContractItem[];
  canManage?: boolean;
}) {
  const { openPopup } = useUniversalPopup();
  const [isOpening, startOpening] = useTransition();

  function changeStatus(contract: EmployeeContractItem, target: ContractStatus) {
    openPopup({ title: target === "terminated" ? "Vertrag kündigen" : "Vertragsstatus ändern", content: <StatusForm tenant={tenant} employeeId={employeeId} employeeHandle={employeeHandle} contract={contract} target={target} /> });
  }

  function openPdf(fileId: string) {
    startOpening(async () => {
      const url = await getHrFileSignedUrlAction({ tenant, fileId, disposition: "inline" });
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  return <div className="flex flex-col gap-3">
    {canManage && <button type="button" className="btn btn-primary btn-sm self-start" onClick={() => openPopup({ title: "Neuen Vertrag anlegen", className: "max-w-[760px]", content: <NewContractForm tenant={tenant} employeeId={employeeId} employeeHandle={employeeHandle} /> })}><FilePlus2 size={14} />Neuer Vertrag</button>}
    {contracts.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-bg p-5 text-center"><FileText className="mx-auto text-muted" size={22} /><div className="mt-2 text-[13px] font-semibold text-ink">Noch kein Vertrag hinterlegt</div><div className="mt-1 text-[12px] text-muted">Lege den ersten Vertrag inklusive PDF an.</div></div> : contracts.map((contract) => <article key={contract.id} className="rounded-xl border border-border bg-bg p-3.5">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-[13.5px] font-semibold text-ink">{contract.title}</div><div className="mt-1 font-mono text-[10.5px] text-muted">{contract.startDate} – {contract.endDate || "laufend"}</div></div><span className={`rounded-[7px] px-2 py-1 font-mono text-[10px] ${contract.status === "active" ? "bg-success/10 text-success" : contract.status === "terminated" ? "bg-danger/10 text-danger" : "bg-white text-muted-2"}`}>{statuses.find((item) => item.value === contract.status)?.label}</span></div>
      <button type="button" disabled={isOpening} onClick={() => openPdf(contract.file.id)} className="mt-3 flex w-full items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-left text-[11.5px] text-ink"><FileText size={14} className="text-danger" /><span className="min-w-0 flex-1 truncate">{contract.file.displayName}</span><Eye size={13} className="text-muted" /></button>
      {canManage && <div className="mt-3 flex flex-wrap gap-2">{contract.status !== "active" && <button type="button" className="btn btn-secondary btn-sm" onClick={() => changeStatus(contract, "active")}><Power size={13} />Aktivieren</button>}{contract.status === "active" && <button type="button" className="btn btn-secondary btn-sm" onClick={() => changeStatus(contract, "inactive")}>Inaktiv setzen</button>}{contract.status !== "terminated" && <button type="button" className="btn btn-secondary btn-sm text-danger" onClick={() => changeStatus(contract, "terminated")}><XCircle size={13} />Kündigen</button>}</div>}
      {contract.terminationDate && <div className="mt-3 rounded-lg bg-danger/5 px-3 py-2 text-[11.5px] text-danger">Gekündigt zum {contract.terminationDate}{contract.terminationReason ? ` · ${contract.terminationReason}` : ""}</div>}
    </article>)}
  </div>;
}
