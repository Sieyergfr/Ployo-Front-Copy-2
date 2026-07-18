"use client";

import { addLocationEmployeesAction } from "@/app/(dashboard)/u/[tenant]/standorte/actions";
import EmployeeSelector, {
  type EmployeeSelectorOption,
} from "@/components/EmployeeSelector";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useUniversalPopup } from "@/components/UniversalPopup";
import { Plus, UserPlus } from "lucide-react";

function AddLocationEmployeesForm({
  tenant,
  locationId,
  employees,
  onDone,
}: {
  tenant: string;
  locationId: string;
  employees: EmployeeSelectorOption[];
  onDone: () => void;
}) {
  return (
    <form action={addLocationEmployeesAction} className="flex flex-col gap-4">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="locationId" value={locationId} />

      <EmployeeSelector
        label="Mitarbeiter hinzufügen"
        name="employees"
        mode="multi"
        options={employees}
      />

      <p className="m-0 text-[12.5px] leading-[1.55] text-muted-2">
        Ausgewählte Mitarbeiter werden dem Standortteam hinzugefügt und im
        Schichtplan als verfügbare Mitarbeiter angezeigt.
      </p>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <FormSubmitButton
          Icon={UserPlus}
          pendingLabel="Wird hinzugefuegt..."
        >
          Hinzufügen
        </FormSubmitButton>
      </div>
    </form>
  );
}

export default function AddLocationEmployeesButton({
  tenant,
  locationId,
  employees,
}: {
  tenant: string;
  locationId: string;
  employees: EmployeeSelectorOption[];
}) {
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      onClick={() => {
        openPopup({
          title: "Mitarbeiter hinzufügen",
          content: (
            <AddLocationEmployeesForm
              tenant={tenant}
              locationId={locationId}
              employees={employees}
              onDone={closePopup}
            />
          ),
        });
      }}
    >
      <Plus size={14} />
      Mitarbeiter
    </button>
  );
}
