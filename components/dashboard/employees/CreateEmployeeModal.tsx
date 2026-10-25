"use client";

import { createEmployeeAction } from "@/app/(dashboard)/u/[tenant]/employees/actions";
import { DbField, DbModal, dbInputClass } from "@/components/dashboard/DbDrawer";
import { DbCtaButton } from "@/components/dashboard/ui";
import { FieldErrors, FormErrorBanner } from "@/components/FormFeedback";
import { LocationMultiSelectDropdown } from "@/components/TeamEditControls";
import type { ActionState } from "@/lib/action-state";
import { Smartphone, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

const initialState: ActionState = {};
const contractOptions = ["Unbefristet", "Teilzeit", "Befristet", "Werkstudentin"] as const;

function Step({ number, title }: { number: number; title: string }) {
  return (
    <span className="flex items-center gap-2.5 text-[14px] font-semibold">
      <span className="flex size-[22px] items-center justify-center rounded-full bg-ink text-[11px] text-white">{number}</span>
      {title}
    </span>
  );
}

function CreateEmployeeForm({
  tenant,
  locations,
  teams,
  roles,
  employeeNumberPreview,
  seats,
  onCancel,
}: {
  tenant: string;
  locations: string[];
  teams: string[];
  roles: string[];
  employeeNumberPreview: string;
  seats: { used: number; limit: number | null };
  onCancel: () => void;
}) {
  const t = useTranslations("EmployeesUi.create");
  const [state, formAction, isPending] = useActionState(createEmployeeAction, initialState);
  const [contract, setContract] = useState<string>("Unbefristet");
  const [email, setEmail] = useState("");
  const freeSeats = seats.limit !== null ? Math.max(0, seats.limit - seats.used) : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="contract" value={contract} />
      <Step number={1} title={t("person")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <DbField label={`${t("firstName")} *`}>
          <input name="firstName" required maxLength={80} autoComplete="off" placeholder={t("firstNamePlaceholder")} className={dbInputClass} />
        </DbField>
        <DbField label={`${t("lastName")} *`}>
          <input name="lastName" required maxLength={80} autoComplete="off" placeholder={t("lastNamePlaceholder")} className={dbInputClass} />
        </DbField>
      </div>
      <DbField label={t("email")} hint={t("emailHint")}>
        <input
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t("emailPlaceholder")}
          className={dbInputClass}
        />
      </DbField>
      <FieldErrors errors={state.fieldErrors?.email} />
      <label
        className={`flex items-center gap-3 rounded-[12px] border border-[#ecebe7] bg-[#fafaf8] px-3.5 py-3 ${email ? "cursor-pointer" : "opacity-60"}`}
      >
        <span className="flex size-8 items-center justify-center rounded-[9px] bg-[rgba(139,110,212,0.12)] text-[#7a5fd0]">
          <Smartphone size={15} />
        </span>
        <span className="flex flex-1 flex-col">
          <span className="text-[14px] font-semibold">{t("inviteToApp")}</span>
          <span className="text-[12.5px] text-[#6e6e6b]">{t("inviteHint")}</span>
        </span>
        <input type="checkbox" name="inviteToApp" disabled={!email} className="size-[18px] accent-[#7a5fd0]" />
      </label>

      <Step number={2} title={t("assignment")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <LocationMultiSelectDropdown defaultLocations={[]} options={teams} name="teams" label={t("teams")} placeholder={t("teamsPlaceholder")} />
        <LocationMultiSelectDropdown defaultLocations={[]} options={locations} />
      </div>

      <Step number={3} title={t("accessContract")} />
      <DbField label={t("role")}>
        <select
          name="role"
          defaultValue={roles.includes("Mitarbeiter") ? "Mitarbeiter" : roles[0] ?? "Mitarbeiter"}
          className={dbInputClass}
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </DbField>
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">{t("contract")}</span>
        <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-[10px] bg-[#f2f1ed] p-1 sm:grid-cols-4">
          {contractOptions.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={contract === option}
              onClick={() => setContract(option)}
              className={`min-h-9 cursor-pointer rounded-[8px] text-[13.5px] font-medium ${contract === option ? "bg-white text-ink shadow-[0_1px_2px_rgba(14,14,14,0.08)]" : "text-[#6e6e6b]"}`}
            >
              {t(`contracts.${option}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <DbField label={t("startDate")}>
          <input name="startDate" type="date" className={dbInputClass} />
        </DbField>
        <DbField label={t("employeeNumber")}>
          <input name="employeeNumber" readOnly value={employeeNumberPreview} aria-readonly="true" className={`${dbInputClass} text-[#6e6e6b]`} />
        </DbField>
      </div>
      <FormErrorBanner message={state.error} />
      <div className="-mx-6 mt-1 -mb-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#ecebe7] px-6 py-4">
        {freeSeats !== null ? (
          <span className="flex items-center gap-2.5 text-[13px] text-[#6e6e6b]">
            <span className="h-1 w-14 overflow-hidden rounded-full bg-[#f2f1ed]">
              <span className="block h-full rounded-full bg-[#8b6ed4]" style={{ width: `${Math.min(100, (seats.used / Math.max(1, seats.limit ?? 1)) * 100)}%` }} />
            </span>
            {t("freeSeats", { count: freeSeats })}
          </span>
        ) : (
          <span />
        )}
        <span className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="db-btn2 db-focus min-h-11 cursor-pointer rounded-[10px] border border-[#ecebe7] bg-[#f2f1ed] px-4 text-[14px] font-semibold"
          >
            {t("cancel")}
          </button>
          <DbCtaButton type="submit" disabled={isPending}>
            <span>{isPending ? t("creating") : t("submit")}</span>
          </DbCtaButton>
        </span>
      </div>
    </form>
  );
}

export default function CreateEmployeeModal(props: {
  tenant: string;
  locations: string[];
  teams: string[];
  roles: string[];
  employeeNumberPreview: string;
  seats: { used: number; limit: number | null };
}) {
  const t = useTranslations("EmployeesUi.create");
  const [open, setOpen] = useState(false);

  return (
    <>
      <DbCtaButton onClick={() => setOpen(true)}>
        <UserPlus size={16} />
        <span>{t("button")}</span>
      </DbCtaButton>
      {open && (
        <DbModal title={t("title")} subtitle={t("subtitle")} onClose={() => setOpen(false)}>
          <CreateEmployeeForm {...props} onCancel={() => setOpen(false)} />
        </DbModal>
      )}
    </>
  );
}
