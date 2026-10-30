"use client";

import { useActionState, useState } from "react";
import {
  linkOwnEmployeeAction,
  unlinkOwnEmployeeAction,
} from "@/app/(dashboard)/u/[tenant]/mein-bereich/actions";
import EmployeeSelector from "@/components/EmployeeSelector";
import FormSubmitButton from "@/components/FormSubmitButton";
import { FieldErrors, FormErrorBanner } from "@/components/FormFeedback";
import { useCloseOnSuccess, useUniversalPopup } from "@/components/UniversalPopup";
import type { ActionState } from "@/lib/action-state";
import { Link2, Search, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";

const initialState: ActionState = {};

type UnlinkedEmployee = {
  id: string;
  initials: string;
  name: string;
  employeeNumber: string;
  location: string;
  team: string;
  role: string;
};

function LinkExistingForm({
  tenant,
  employees,
  onDone,
}: {
  tenant: string;
  employees: UnlinkedEmployee[];
  onDone: () => void;
}) {
  const t = useTranslations("SelfServiceEmployeeLink");
  const [state, formAction, isPending] = useActionState(linkOwnEmployeeAction, initialState);
  useCloseOnSuccess(state, isPending, onDone);

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />

      <EmployeeSelector
        label={t("employeeRecord")}
        name="employeeId"
        mode="single"
        options={employees}
      />
      <FieldErrors errors={state.fieldErrors?.employeeId} />

      <p className="m-0 text-[12.5px] leading-[1.55] text-muted-2">
        {t("linkDescription")}
      </p>

      <FormErrorBanner message={state.error} />

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <FormSubmitButton Icon={Link2} pendingLabel={t("linking")}>
          {t("link")}
        </FormSubmitButton>
      </div>
    </form>
  );
}

function UnlinkConfirmForm({
  tenant,
  employeeName,
  onDone,
}: {
  tenant: string;
  employeeName: string;
  onDone: () => void;
}) {
  const t = useTranslations("SelfServiceEmployeeLink");
  const [state, formAction, isPending] = useActionState(unlinkOwnEmployeeAction, initialState);
  useCloseOnSuccess(state, isPending, onDone);

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />

      <p className="m-0 text-[13px] leading-[1.55] text-muted-2">
        {t.rich("unlinkDescription", {
          name: employeeName,
          b: (chunks) => <strong className="text-ink">{chunks}</strong>,
        })}
      </p>

      <FormErrorBanner message={state.error} />

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <FormSubmitButton
          Icon={Unlink}
          pendingLabel={t("unlinking")}
          className="btn btn-secondary border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
        >
          {t("unlinkConfirm")}
        </FormSubmitButton>
      </div>
    </form>
  );
}

export function UnlinkOwnEmployeeButton({
  tenant,
  employeeName,
}: {
  tenant: string;
  employeeName: string;
}) {
  const t = useTranslations("SelfServiceEmployeeLink");
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="db-btn2 db-focus inline-flex min-h-[38px] cursor-pointer items-center rounded-[9px] border border-[#ecebe7] bg-[#f2f1ed] px-3 py-2 text-[13px] font-medium text-ink"
      onClick={() =>
        openPopup({
          title: t("unlinkConfirm"),
          content: (
            <UnlinkConfirmForm tenant={tenant} employeeName={employeeName} onDone={closePopup} />
          ),
        })
      }
    >
      {t("unlinkButton")}
    </button>
  );
}

const avatarColors = ["#c9622a", "#2a5bc9", "#1d8a65", "#7a3c9c", "#b7791f", "#4a5568"];

/** Profilauswahl direkt auf der Seite (neues Design "Mein Bereich", nicht verknüpft). */
export function LinkProfilePicker({
  tenant,
  unlinkedEmployees,
}: {
  tenant: string;
  unlinkedEmployees: UnlinkedEmployee[];
}) {
  const t = useTranslations("SelfServiceEmployeeLink");
  const [state, formAction, isPending] = useActionState(linkOwnEmployeeAction, initialState);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleEmployees = unlinkedEmployees.filter((employee) =>
    [employee.name, employee.employeeNumber, employee.location, employee.team, employee.role]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );
  const hasVisibleSelection = visibleEmployees.some((employee) => employee.id === selectedId);

  if (unlinkedEmployees.length === 0) {
    return <p className="m-0 text-[13px] leading-[1.55] text-[#6e6e6b]">{t("noUnlinkedProfile")}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="tenant" value={tenant} />
      <span className="font-mono text-[10px] tracking-[0.12em] text-[#6e6e6b] uppercase">{t("chooseProfile")}</span>
      <label className="relative block">
        <span className="sr-only">{t("searchEmployees")}</span>
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6e6e6b]" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="db-focus min-h-11 w-full rounded-[10px] border border-[#e4e3df] bg-white py-2 pl-10 pr-3 text-[13px] text-ink"
        />
      </label>
      <p role="status" className="m-0 text-[12px] text-[#6e6e6b]">
        {visibleEmployees.length === 0
          ? t("noSearchResults")
          : t("searchResults", { count: visibleEmployees.length, total: unlinkedEmployees.length })}
      </p>
      <div
        className="flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain p-1"
        style={{ maxHeight: "min(240px, 35dvh)" }}
        role="group"
        aria-label={t("chooseProfile")}
        tabIndex={0}
      >
        {visibleEmployees.map((employee, index) => (
          <label
            key={employee.id}
            className="db-pick flex shrink-0 cursor-pointer items-center gap-3 rounded-[12px] border border-[#e4e3df] bg-[#fafaf8] px-3.5 py-3 has-[:checked]:border-[rgba(139,110,212,0.6)] has-[:checked]:bg-white has-[:checked]:shadow-[0_0_0_3px_rgba(139,110,212,0.12)]"
          >
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
              style={{ background: avatarColors[index % avatarColors.length] }}
            >
              {employee.initials}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14px] font-semibold text-ink">{employee.name}</span>
              <span className="truncate text-[12.5px] text-[#6e6e6b]">
                {[employee.role, employee.location].filter(Boolean).join(" · ")}
              </span>
            </span>
            <input type="radio" name="employeeId" value={employee.id} checked={selectedId === employee.id} onChange={() => setSelectedId(employee.id)} required className="size-[18px] accent-[#7a5fd0]" />
          </label>
        ))}
      </div>
      <span className="text-[12px] text-[#6e6e6b]">{t("onlyUnlinkedHint")}</span>
      <FormErrorBanner message={state.error} />
      <div className="mt-3">
        <button
          type="submit"
          disabled={isPending || !hasVisibleSelection}
          className="db-cta db-focus relative inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-[10px] border border-[rgba(167,142,232,0.45)] bg-ink px-[18px] py-2.5 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          <span>{isPending ? t("linking") : t("linkMe")}</span>
        </button>
      </div>
    </form>
  );
}

type SelfServiceEmployeeLinkProps = {
  tenant: string;
  unlinkedEmployees: UnlinkedEmployee[];
};

/**
 * Nur noch "Bestehendes Profil verknüpfen" — das Anlegen eines neuen,
 * eigenen Profils per Self-Service wurde bewusst entfernt (To-Do:
 * "Konto verknüpfen => Mitarbeiter auswählen, statt anlegen"). Fehlt eine
 * unverknüpfte Personalakte im Betrieb, muss HR eine anlegen bzw.
 * verknüpfen.
 */
export default function SelfServiceEmployeeLink({
  tenant,
  unlinkedEmployees,
}: SelfServiceEmployeeLinkProps) {
  const t = useTranslations("SelfServiceEmployeeLink");
  const { openPopup, closePopup } = useUniversalPopup();

  if (unlinkedEmployees.length === 0) {
    return (
      <p className="mt-4 text-center text-[12.5px] leading-[1.55] text-muted-2">
        {t("noUnlinkedProfile")}
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2.5">
      <button
        type="button"
        className="btn btn-primary"
        onClick={() =>
          openPopup({
            title: t("linkExisting"),
            content: (
              <LinkExistingForm
                tenant={tenant}
                employees={unlinkedEmployees}
                onDone={closePopup}
              />
            ),
          })
        }
      >
        <Link2 size={15} />
        {t("linkExisting")}
      </button>
    </div>
  );
}
