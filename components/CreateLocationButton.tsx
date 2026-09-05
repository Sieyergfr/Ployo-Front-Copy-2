"use client";

import { createLocationAction } from "@/app/(dashboard)/u/[tenant]/standorte/actions";
import AddressFields from "@/components/AddressFields";
import EmployeeSelector, {
  type EmployeeSelectorOption,
} from "@/components/EmployeeSelector";
import FormSubmitButton from "@/components/FormSubmitButton";
import { OpeningHoursEditor } from "@/components/OpeningHoursEditor";
import { useActionStateWithToast } from "@/components/Toasts";
import { useUniversalPopup } from "@/components/UniversalPopup";
import { locationColorPalette, locationKinds } from "@/lib/org-options";
import { Building2, Check, ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

type DropdownOption = {
  value: string;
  label: string;
  meta?: string;
};

const locationColors = locationColorPalette;

function CustomDropdownField({
  label,
  name,
  placeholder,
  options,
  defaultValue = "",
}: {
  label: string;
  name: string;
  placeholder: string;
  options: DropdownOption[];
  defaultValue?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(defaultValue);
  const selectedOption = options.find((option) => option.value === selectedValue);
  const listboxId = `${name}-dropdown-listbox`;
  const labelId = `${name}-dropdown-label`;

  return (
    <div
      className="field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <label id={labelId} className="label">
        {label}
      </label>

      <input type="hidden" name={name} value={selectedValue} />

      <div className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-labelledby={labelId}
          aria-controls={listboxId}
          className="input flex cursor-pointer items-center justify-between gap-3 bg-bg text-left"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className={selectedOption ? "text-ink" : "text-muted"}>
            {selectedOption?.label ?? placeholder}
          </span>
          <ChevronDown
            size={14}
            className={`shrink-0 text-muted transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {isOpen && (
          <div
            id={listboxId}
            role="listbox"
            aria-labelledby={labelId}
            className="absolute z-50 mt-1.5 max-h-56 w-full overflow-y-auto rounded-[10px] border border-border bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
          >
            {options.map((option) => {
              const isSelected = option.value === selectedValue;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    isSelected ? "bg-border-soft" : "hover:bg-bg"
                  }`}
                  onClick={() => {
                    setSelectedValue(option.value);
                    setIsOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {option.label}
                    </span>
                    {option.meta && (
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">
                        {option.meta}
                      </span>
                    )}
                  </span>
                  {isSelected && (
                    <Check size={13} className="shrink-0 text-success" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function LocationColorPicker() {
  const t = useTranslations("CreateLocationButton");
  const [selectedColor, setSelectedColor] = useState<string>(locationColors[0].value);

  return (
    <div className="field">
      <div className="label">{t("locationColor")}</div>
      <input type="hidden" name="color" value={selectedColor} />
      <div className="flex flex-wrap gap-2">
        {locationColors.map((color) => {
          const isSelected = color.value === selectedColor;

          return (
            <button
              key={color.value}
              type="button"
              aria-label={color.label}
              title={color.label}
              className={`flex size-9 cursor-pointer items-center justify-center rounded-[9px] border transition-colors ${
                isSelected ? "border-ink" : "border-border hover:border-muted"
              }`}
              onClick={() => setSelectedColor(color.value)}
            >
              <span className={`size-4 rounded-full ${color.className}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CreateLocationForm({
  tenant,
  employees,
  onDone,
}: {
  tenant: string;
  employees: EmployeeSelectorOption[];
  onDone: () => void;
}) {
  const t = useTranslations("CreateLocationButton");
  const tAddress = useTranslations("AddressFields");
  const [, formAction] = useActionStateWithToast(createLocationAction);

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <div className="field">
        <label htmlFor="location-name" className="label">
          {t("locationName")}
        </label>
        <input
          id="location-name"
          name="name"
          className="input"
          placeholder={t("locationNamePlaceholder")}
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CustomDropdownField
          label={t("type")}
          name="kind"
          placeholder={t("select")}
          defaultValue="Filiale"
          options={locationKinds.map((kind) => ({ value: kind, label: kind }))}
        />

        <CustomDropdownField
          label={t("status")}
          name="status"
          placeholder={t("select")}
          defaultValue="active"
          options={[
            { value: "active", label: t("active") },
            { value: "inactive", label: t("inactive") },
          ]}
        />
      </div>

      <div>
        <div className="mb-2 label">{t("address")}</div>
        <AddressFields idPrefix="location-address" required t={tAddress} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <EmployeeSelector
          label={t("locationLead")}
          name="lead"
          options={employees}
        />

        <div className="field">
          <label htmlFor="location-email" className="label">
            {t("contactEmail")}
          </label>
          <input
            id="location-email"
            name="email"
            type="email"
            className="input"
            placeholder="standort@example.com"
            autoComplete="email"
          />
        </div>
      </div>

      <LocationColorPicker />

      <div className="field max-w-[280px]">
        <label htmlFor="location-min-staffing" className="label">
          {t("minStaffingPerDay")}
        </label>
        <input
          id="location-min-staffing"
          name="shiftMinStaffing"
          type="number"
          min={0}
          max={99}
          className="input"
          placeholder={t("companyDefault")}
        />
        <p className="m-0 text-[11px] text-muted">
          {t("minStaffingHint")}
        </p>
      </div>

      <div>
        <div className="mb-2 label">{t("openingHours")}</div>
        <OpeningHoursEditor name="openingHours" defaultValue={[]} allowInherit initiallyCustom={false} />
      </div>

      <p className="m-0 text-[12.5px] leading-[1.55] text-muted-2">
        {t("assignmentHint")}
      </p>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <FormSubmitButton
          Icon={Building2}
          pendingLabel={t("creatingLocation")}
        >
          {t("createLocation")}
        </FormSubmitButton>
      </div>
    </form>
  );
}

export default function CreateLocationButton({
  tenant,
  employees,
}: {
  tenant: string;
  employees: EmployeeSelectorOption[];
}) {
  const t = useTranslations("CreateLocationButton");
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => {
        openPopup({
          title: t("createLocation"),
          content: (
            <CreateLocationForm
              tenant={tenant}
              employees={employees}
              onDone={closePopup}
            />
          ),
        });
      }}
    >
      <Plus size={15} strokeWidth={2} />
      {t("addLocation")}
    </button>
  );
}
