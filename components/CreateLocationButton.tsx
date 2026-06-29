"use client";

import { useUniversalPopup } from "@/components/UniversalPopup";
import { employees } from "@/lib/employees";
import { Building2, Check, ChevronDown, Plus } from "lucide-react";
import { useMemo, useState } from "react";

type DropdownOption = {
  value: string;
  label: string;
  meta?: string;
};

const locationColors = [
  { value: "black", className: "bg-ink", label: "Schwarz" },
  { value: "blue", className: "bg-[#2A6FDB]", label: "Blau" },
  { value: "green", className: "bg-success", label: "Grün" },
  { value: "purple", className: "bg-[#8B6ED4]", label: "Violett" },
  { value: "orange", className: "bg-[#C9622A]", label: "Orange" },
  { value: "red", className: "bg-danger", label: "Rot" },
  { value: "teal", className: "bg-[#168A8A]", label: "Türkis" },
  { value: "slate", className: "bg-[#5C6B7A]", label: "Schiefer" },
];

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
  const [selectedColor, setSelectedColor] = useState(locationColors[0].value);

  return (
    <div className="field">
      <div className="label">Standortfarbe</div>
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

function CreateLocationForm({ onDone }: { onDone: () => void }) {
  const leadOptions = useMemo(
    () =>
      employees.map((employee) => ({
        value: employee.id,
        label: employee.name,
        meta: `${employee.location} · ${employee.team}`,
      })),
    [],
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onDone();
      }}
    >
      <div className="field">
        <label htmlFor="location-name" className="label">
          Standortname
        </label>
        <input
          id="location-name"
          name="name"
          className="input"
          placeholder="Filiale München Zentrum"
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CustomDropdownField
          label="Typ"
          name="kind"
          placeholder="Auswählen"
          options={[
            { value: "Filiale", label: "Filiale" },
            { value: "Zentrale", label: "Zentrale" },
            { value: "Lager", label: "Lager" },
            { value: "Büro", label: "Büro" },
          ]}
        />

        <CustomDropdownField
          label="Status"
          name="status"
          placeholder="Auswählen"
          defaultValue="active"
          options={[
            { value: "active", label: "Aktiv" },
            { value: "inactive", label: "Inaktiv" },
          ]}
        />
      </div>

      <div className="field">
        <label htmlFor="location-address" className="label">
          Straße und Hausnummer
        </label>
        <input
          id="location-address"
          name="address"
          className="input"
          placeholder="Leopoldstraße 12"
          autoComplete="street-address"
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        <div className="field">
          <label htmlFor="location-postal-code" className="label">
            PLZ
          </label>
          <input
            id="location-postal-code"
            name="postalCode"
            className="input"
            placeholder="80802"
            autoComplete="postal-code"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="location-city" className="label">
            Ort
          </label>
          <input
            id="location-city"
            name="city"
            className="input"
            placeholder="München"
            autoComplete="address-level2"
            required
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CustomDropdownField
          label="Standortleitung"
          name="lead"
          placeholder="Mitarbeiter auswählen"
          options={leadOptions}
        />

        <div className="field">
          <label htmlFor="location-email" className="label">
            Kontakt E-Mail
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

      <p className="m-0 text-[12.5px] leading-[1.55] text-muted-2">
        Teams, Mitarbeiter und Schichten können nach dem Anlegen dem Standort
        zugeordnet werden.
      </p>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary">
          <Building2 size={15} strokeWidth={2} />
          Standort erstellen
        </button>
      </div>
    </form>
  );
}

export default function CreateLocationButton() {
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => {
        openPopup({
          title: "Standort erstellen",
          content: <CreateLocationForm onDone={closePopup} />,
        });
      }}
    >
      <Plus size={15} strokeWidth={2} />
      Standort anlegen
    </button>
  );
}
