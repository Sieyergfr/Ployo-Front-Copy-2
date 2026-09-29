"use client";

import { useActionState } from "react";
import { createEmployeeAction } from "@/app/(dashboard)/u/[tenant]/employees/actions";
import DatePickerField from "@/components/DatePickerField";
import FormSubmitButton from "@/components/FormSubmitButton";
import { FieldErrors, FormErrorBanner } from "@/components/FormFeedback";
import { useUniversalPopup } from "@/components/UniversalPopup";
import { LocationMultiSelectDropdown } from "@/components/TeamEditControls";
import type { ActionState } from "@/lib/action-state";
import { Plus, Send } from "lucide-react";
import { useTranslations } from "next-intl";

const initialState: ActionState = {};

type InviteEmployeeButtonProps = {
  tenant: string;
  locations: string[];
  permissionRoles: string[];
  teams: string[];
  employeeNumberPreview: string;
};

function InviteEmployeeForm({
  tenant,
  locations,
  permissionRoles,
  teams,
  employeeNumberPreview,
  onDone,
}: InviteEmployeeButtonProps & { onDone: () => void }) {
  const [state, formAction] = useActionState(createEmployeeAction, initialState);
  const t = useTranslations("InviteEmployeeButton");

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="invite-first-name" className="label">
            {t("firstName")}
          </label>
          <input
            id="invite-first-name"
            name="firstName"
            className="input"
            placeholder="Sophie"
            autoComplete="given-name"
          />
        </div>

        <div className="field">
          <label htmlFor="invite-last-name" className="label">
            {t("lastName")}
          </label>
          <input
            id="invite-last-name"
            name="lastName"
            className="input"
            placeholder="Wagner"
            autoComplete="family-name"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="invite-email" className="label">
          {t("email")}
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          className="input"
          placeholder="sophie.wagner@example.com"
          autoComplete="email"
        />
        <FieldErrors errors={state.fieldErrors?.email} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <LocationMultiSelectDropdown defaultLocations={[]} options={locations} />

        <LocationMultiSelectDropdown
          defaultLocations={[]}
          options={teams}
          name="teams"
          label={t("team")}
          placeholder={t("selectTeams")}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="invite-role" className="label">
            {t("permissionRole")}
          </label>
          <select
            id="invite-role"
            name="role"
            className="input cursor-pointer bg-bg"
            defaultValue={permissionRoles[0] ?? "Mitarbeiter"}
          >
            {permissionRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="invite-contract" className="label">
            {t("contract")}
          </label>
          <select
            id="invite-contract"
            name="contract"
            className="input cursor-pointer bg-bg"
            defaultValue="Unbefristet"
          >
            <option value="Unbefristet">{t("contractPermanent")}</option>
            <option value="Teilzeit">{t("contractPartTime")}</option>
            <option value="Befristet">{t("contractFixedTerm")}</option>
            <option value="Werkstudentin">{t("contractWorkingStudent")}</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="invite-start-date" className="label">
            {t("startDate")}
          </label>
          <DatePickerField id="invite-start-date" name="startDate" />
        </div>

        <div className="field">
          <label htmlFor="invite-employee-number" className="label">
            {t("employeeNumber")}
          </label>
          <input
            id="invite-employee-number"
            name="employeeNumber"
            className="input input-mono bg-bg text-muted-2"
            value={employeeNumberPreview}
            readOnly
            aria-readonly="true"
          />
          <p className="m-0 text-[11px] text-muted">{t("employeeNumberAutoHint")}</p>
        </div>
      </div>

      <p className="m-0 text-[12.5px] leading-[1.55] text-muted-2">
        {t("hint")}
      </p>

      <FormErrorBanner message={state.error} />

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <FormSubmitButton
          Icon={Send}
          pendingLabel={t("submitting")}
        >
          {t("submit")}
        </FormSubmitButton>
      </div>
    </form>
  );
}

export default function InviteEmployeeButton(props: InviteEmployeeButtonProps) {
  const { openPopup, closePopup } = useUniversalPopup();
  const t = useTranslations("InviteEmployeeButton");

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => {
        openPopup({
          title: t("createTitle"),
          content: <InviteEmployeeForm {...props} onDone={closePopup} />,
        });
      }}
    >
      <Plus size={15} strokeWidth={2} />
      {t("submit")}
    </button>
  );
}
