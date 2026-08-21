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
import { Eye, FilePlus2, FileText, FileUp, Power, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

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

function getStatuses(t: (key: string) => string): Array<{ value: ContractStatus; label: string }> {
  return [
    { value: "draft", label: t("statusDraft") },
    { value: "active", label: t("statusActive") },
    { value: "terminated", label: t("statusTerminated") },
    { value: "expired", label: t("statusExpired") },
    { value: "inactive", label: t("statusInactive") },
  ];
}

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
  const t = useTranslations("EmployeeContracts");
  const statuses = getStatuses(t);
  const [fileName, setFileName] = useState("");

  return (
    <form action={createEmployeeContractAction} className="grid gap-4 sm:grid-cols-2">
      <HiddenContext tenant={tenant} employeeId={employeeId} employeeHandle={employeeHandle} />
      <label className="field sm:col-span-2"><span className="label">{t("newContractTitle")}</span><input className="input" name="title" placeholder={t("newContractPlaceholder")} required /></label>
      <label className="field"><span className="label">{t("contractType")}</span><select className="input" name="contractType" defaultValue="Arbeitsvertrag"><option value="Arbeitsvertrag">{t("contractTypeStandard")}</option><option value="Befristeter Arbeitsvertrag">{t("contractTypeFixedTerm")}</option><option value="Teilzeitvertrag">{t("contractTypePartTime")}</option><option value="Änderungsvertrag">{t("contractTypeAmendment")}</option><option value="Zusatzvereinbarung">{t("contractTypeSupplement")}</option></select></label>
      <label className="field"><span className="label">{t("status")}</span><select className="input" name="status" defaultValue="active">{statuses.slice(0, 2).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="field"><span className="label">{t("startDate")}</span><DatePickerField id="contract-start-date" name="startDate" placeholder={t("startDatePlaceholder")} /></label>
      <label className="field"><span className="label">{t("endDate")}</span><DatePickerField id="contract-end-date" name="endDate" placeholder={t("optionalPlaceholder")} /></label>
      <label className="field"><span className="label">{t("position")}</span><input className="input" name="position" /></label>
      <label className="field"><span className="label">{t("department")}</span><input className="input" name="department" /></label>
      <label className="field"><span className="label">{t("workLocation")}</span><input className="input" name="workLocation" /></label>
      <label className="field"><span className="label">{t("weeklyHours")}</span><input className="input" name="weeklyHours" placeholder={t("weeklyHoursPlaceholder")} /></label>
      <label className="field"><span className="label">{t("compensation")}</span><input className="input" name="compensation" /></label>
      <label className="field"><span className="label">{t("vacationDays")}</span><input className="input" type="number" min="0" name="vacationDays" /></label>
      <label className="field"><span className="label">{t("probationEndDate")}</span><DatePickerField id="contract-probation-end-date" name="probationEndDate" placeholder={t("optionalPlaceholder")} /></label>
      <label className="field"><span className="label">{t("noticePeriod")}</span><input className="input" name="noticePeriod" /></label>
      <div className="field sm:col-span-2">
        <span className="label">{t("contractPdf")}</span>
        <label
          htmlFor="new-contract-file"
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg px-4 py-6 text-center transition-colors hover:border-muted"
        >
          <FileUp size={22} className="mb-2 text-muted-2" />
          <span className="text-[13px] font-semibold text-ink">{t("contractPdf")}</span>
          <span className="mt-1 max-w-full truncate text-[11.5px] text-muted">
            {fileName || t("contractPdfHint")}
          </span>
        </label>
        <input
          id="new-contract-file"
          className="sr-only"
          type="file"
          name="contractFile"
          accept="application/pdf,.pdf"
          required
          onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? "")}
        />
      </div>
      <label className="field sm:col-span-2"><span className="label">{t("note")}</span><textarea className="input min-h-20 py-3" name="notes" /></label>
      <div className="sm:col-span-2 flex justify-end border-t border-border-soft pt-4"><FormSubmitButton Icon={FilePlus2} pendingLabel={t("creatingContract")}>{t("createContract")}</FormSubmitButton></div>
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
  const t = useTranslations("EmployeeContracts");

  return <form action={updateEmployeeContractStatusAction} className="flex flex-col gap-4">
    <HiddenContext tenant={tenant} employeeId={employeeId} employeeHandle={employeeHandle} />
    <input type="hidden" name="contractId" value={contract.id} />
    <input type="hidden" name="status" value={target} />
    <p className="text-[13px] leading-5 text-muted-2">{t.rich("changeStatusOf", { title: contract.title, b: (chunks) => <strong className="text-ink">{chunks}</strong> })}</p>
    {target === "terminated" && <><label className="field"><span className="label">{t("terminationDate")}</span><DatePickerField id={`termination-date-${contract.id}`} name="terminationDate" placeholder={t("terminationDatePlaceholder")} /></label><label className="field"><span className="label">{t("terminationReason")}</span><textarea className="input min-h-24 py-3" name="terminationReason" required /></label></>}
    <div className="flex justify-end border-t border-border-soft pt-4"><FormSubmitButton pendingLabel={t("savingStatus")}>{t("saveStatus")}</FormSubmitButton></div>
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
  const t = useTranslations("EmployeeContracts");
  const statuses = getStatuses(t);

  function changeStatus(contract: EmployeeContractItem, target: ContractStatus) {
    openPopup({ title: target === "terminated" ? t("terminateContractTitle") : t("changeStatusTitle"), content: <StatusForm tenant={tenant} employeeId={employeeId} employeeHandle={employeeHandle} contract={contract} target={target} /> });
  }

  function openPdf(fileId: string) {
    startOpening(async () => {
      const url = await getHrFileSignedUrlAction({ tenant, fileId, disposition: "inline" });
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  return <div className="flex flex-col gap-3">
    {canManage && <button type="button" className="btn btn-primary btn-sm self-start" onClick={() => openPopup({ title: t("newContractPopupTitle"), className: "max-w-[760px]", content: <NewContractForm tenant={tenant} employeeId={employeeId} employeeHandle={employeeHandle} /> })}><FilePlus2 size={14} />{t("newContract")}</button>}
    {contracts.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-bg p-5 text-center"><FileText className="mx-auto text-muted" size={22} /><div className="mt-2 text-[13px] font-semibold text-ink">{t("noContractsTitle")}</div><div className="mt-1 text-[12px] text-muted">{t("noContractsDescription")}</div></div> : contracts.map((contract) => <article key={contract.id} className="rounded-xl border border-border bg-bg p-3.5">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-[13.5px] font-semibold text-ink">{contract.title}</div><div className="mt-1 font-mono text-[10.5px] text-muted">{contract.startDate} – {contract.endDate || t("ongoing")}</div></div><span className={`rounded-[7px] px-2 py-1 font-mono text-[10px] ${contract.status === "active" ? "bg-success/10 text-success" : contract.status === "terminated" ? "bg-danger/10 text-danger" : "bg-white text-muted-2"}`}>{statuses.find((item) => item.value === contract.status)?.label}</span></div>
      <button type="button" disabled={isOpening} onClick={() => openPdf(contract.file.id)} className="mt-3 flex w-full items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-left text-[11.5px] text-ink"><FileText size={14} className="text-danger" /><span className="min-w-0 flex-1 truncate">{contract.file.displayName}</span><Eye size={13} className="text-muted" /></button>
      {canManage && <div className="mt-3 flex flex-wrap gap-2">{contract.status !== "active" && <button type="button" className="btn btn-secondary btn-sm" onClick={() => changeStatus(contract, "active")}><Power size={13} />{t("activate")}</button>}{contract.status === "active" && <button type="button" className="btn btn-secondary btn-sm" onClick={() => changeStatus(contract, "inactive")}>{t("setInactive")}</button>}{contract.status !== "terminated" && <button type="button" className="btn btn-secondary btn-sm text-danger" onClick={() => changeStatus(contract, "terminated")}><XCircle size={13} />{t("terminate")}</button>}</div>}
      {contract.terminationDate && <div className="mt-3 rounded-lg bg-danger/5 px-3 py-2 text-[11.5px] text-danger">{t("terminatedOn", { date: contract.terminationDate })}{contract.terminationReason ? ` · ${contract.terminationReason}` : ""}</div>}
    </article>)}
  </div>;
}
