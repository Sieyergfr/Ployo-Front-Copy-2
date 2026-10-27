"use client";

import { addTeamMembersAction } from "@/app/(dashboard)/u/[tenant]/teams/actions";
import EmployeeSelector, {
  type EmployeeSelectorOption,
} from "@/components/EmployeeSelector";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useActionStateWithToast } from "@/components/Toasts";
import { useUniversalPopup } from "@/components/UniversalPopup";
import { Plus, UserPlus } from "lucide-react";
import { ctaClass } from "@/components/dashboard/ui";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations>;

/**
 * "Mitglieder anpassen" öffnete bisher den Bearbeitungsmodus der ganzen
 * Team-Seite, obwohl es nur darum geht, Mitarbeiter hinzuzufügen. Hier
 * stattdessen ein Popup mit Mehrfachauswahl — mehrere Mitarbeiter in einem
 * Schritt statt einer Dropdown-Auswahl pro Person.
 */
function AddTeamMembersForm({
  tenant,
  teamId,
  teamHandle,
  defaultRole,
  employees,
  onDone,
  t,
}: {
  tenant: string;
  teamId: string;
  teamHandle: string;
  defaultRole: string;
  employees: EmployeeSelectorOption[];
  onDone: () => void;
  t: T;
}) {
  const [, formAction] = useActionStateWithToast(addTeamMembersAction);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="teamHandle" value={teamHandle} />

      {employees.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">
          {t("allMembersAlready")}
        </p>
      ) : (
        <EmployeeSelector
          label={t("selectEmployees")}
          name="employees"
          mode="multi"
          options={employees}
        />
      )}

      <div className="field">
        <label htmlFor="team-members-role" className="label">
          {t("roleInTeam")}
        </label>
        <input
          id="team-members-role"
          name="role"
          className="input"
          defaultValue={defaultRole}
        />
      </div>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <FormSubmitButton Icon={UserPlus} pendingLabel={t("adding")}>
          {t("add")}
        </FormSubmitButton>
      </div>
    </form>
  );
}

export default function AddTeamMembersButton({
  tenant,
  teamId,
  teamHandle,
  defaultRole,
  employees,
  variant = "button",
}: {
  tenant: string;
  teamId: string;
  teamHandle: string;
  defaultRole: string;
  employees: EmployeeSelectorOption[];
  /** "icon": kompaktes Plus neben einer Überschrift; "cta": dunkler Haupt-Button. */
  variant?: "button" | "icon" | "cta";
}) {
  const t = useTranslations("AddTeamMembersButton");
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className={
        variant === "icon"
          ? "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
          : variant === "cta"
            ? `${ctaClass} min-h-10`
            : "btn btn-secondary btn-sm"
      }
      title={t("addMembers")}
      aria-label={t("addMembers")}
      onClick={() =>
        openPopup({
          title: t("addMembers"),
          content: (
            <AddTeamMembersForm
              tenant={tenant}
              teamId={teamId}
              teamHandle={teamHandle}
              defaultRole={defaultRole}
              employees={employees}
              onDone={closePopup}
              t={t}
            />
          ),
        })
      }
    >
      <Plus size={14} />
      {variant === "icon" ? null : t("addMembers")}
    </button>
  );
}
