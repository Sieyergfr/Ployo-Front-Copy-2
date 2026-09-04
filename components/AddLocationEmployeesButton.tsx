"use client";

import { addLocationEmployeesAction } from "@/app/(dashboard)/u/[tenant]/standorte/actions";
import EmployeeSelector, {
  type EmployeeSelectorOption,
} from "@/components/EmployeeSelector";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useUniversalPopup } from "@/components/UniversalPopup";
import { Plus, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";

function AddLocationEmployeesForm({
  tenant,
  locationId,
  employees,
  assignedIds,
  onDone,
}: {
  tenant: string;
  locationId: string;
  employees: EmployeeSelectorOption[];
  assignedIds: string[];
  onDone: () => void;
}) {
  const t = useTranslations("AddLocationEmployeesButton");

  return (
    <form action={addLocationEmployeesAction} className="flex flex-col gap-4">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="locationId" value={locationId} />

      {/* Bereits zugewiesene Mitarbeiter stehen mit in der Liste und sind
          vorausgewählt: sonst sah der Dialog aus, als wäre noch niemand am
          Standort. Sie erneut abzuschicken ist folgenlos —
          addEmployeesToTenantLocation überspringt vorhandene Mitglieder. */}
      <EmployeeSelector
        label={t("addEmployees")}
        name="employees"
        mode="multi"
        options={employees}
        defaultSelectedIds={assignedIds}
      />

      <p className="m-0 text-[12.5px] leading-[1.55] text-muted-2">
        {t("assignmentHint")}
      </p>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <FormSubmitButton
          Icon={UserPlus}
          pendingLabel={t("adding")}
        >
          {t("add")}
        </FormSubmitButton>
      </div>
    </form>
  );
}

export default function AddLocationEmployeesButton({
  tenant,
  locationId,
  employees,
  assignedIds = [],
  variant = "button",
}: {
  tenant: string;
  locationId: string;
  /** Alle Mitarbeiter des Betriebs — inklusive der bereits zugewiesenen. */
  employees: EmployeeSelectorOption[];
  /** Wer dem Standort schon zugewiesen ist; erscheint vorausgewählt. */
  assignedIds?: string[];
  /** "icon": kompaktes Plus neben der Team-Überschrift statt eines Kopfzeilen-Buttons. */
  variant?: "button" | "icon";
}) {
  const t = useTranslations("AddLocationEmployeesButton");
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className={
        variant === "icon"
          ? "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
          : "btn btn-primary btn-sm"
      }
      title={t("addEmployees")}
      aria-label={t("addEmployees")}
      onClick={() => {
        openPopup({
          title: t("addEmployees"),
          content: (
            <AddLocationEmployeesForm
              tenant={tenant}
              locationId={locationId}
              employees={employees}
              assignedIds={assignedIds}
              onDone={closePopup}
            />
          ),
        });
      }}
    >
      <Plus size={14} />
      {variant === "icon" ? null : t("employees")}
    </button>
  );
}
