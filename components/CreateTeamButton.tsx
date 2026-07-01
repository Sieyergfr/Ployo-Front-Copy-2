"use client";

import { useUniversalPopup } from "@/components/UniversalPopup";
import { LocationMultiSelectDropdown } from "@/components/TeamEditControls";
import { employees } from "@/lib/employees";
import { Check, ChevronDown, Plus, Users } from "lucide-react";
import { useMemo, useState } from "react";

type DropdownOption = {
  value: string;
  label: string;
  meta?: string;
};

const teamColors = [
  { value: "orange", className: "bg-[#C9622A]", label: "Orange" },
  { value: "blue", className: "bg-[#2A5BC9]", label: "Blau" },
  { value: "green", className: "bg-[#1D8A65]", label: "Grün" },
  { value: "purple", className: "bg-[#7A3C9C]", label: "Violett" },
  { value: "red", className: "bg-[#B4332A]", label: "Rot" },
  { value: "teal", className: "bg-[#168A8A]", label: "Türkis" },
  { value: "gold", className: "bg-[#B7791F]", label: "Gold" },
  { value: "slate", className: "bg-[#4A5568]", label: "Schiefer" },
  { value: "pink", className: "bg-[#C23B7A]", label: "Pink" },
  { value: "lime", className: "bg-[#6B8E23]", label: "Limette" },
];

function CustomDropdownField({
  label,
  name,
  placeholder,
  options,
}: {
  label: string;
  name: string;
  placeholder: string;
  options: DropdownOption[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState("");
  const selectedOption = options.find((option) => option.value === selectedValue);
  const listboxId = `${name}-team-dropdown-listbox`;
  const labelId = `${name}-team-dropdown-label`;

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

function TeamColorPicker() {
  const [selectedColor, setSelectedColor] = useState(teamColors[0].value);

  return (
    <div className="field">
      <div className="label">Teamfarbe</div>
      <input type="hidden" name="color" value={selectedColor} />
      <div className="flex flex-wrap gap-2">
        {teamColors.map((color) => {
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

function CreateTeamForm({ onDone }: { onDone: () => void }) {
  const leadOptions = useMemo(
    () =>
      employees.map((employee) => ({
        value: employee.id,
        label: employee.name,
        meta: `${employee.location} · ${employee.role}`,
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
        <label htmlFor="team-name" className="label">
          Teamname
        </label>
        <input
          id="team-name"
          name="name"
          className="input"
          placeholder="z. B. Verkauf"
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <LocationMultiSelectDropdown defaultLocations={["München"]} />

        <CustomDropdownField
          label="Teamleitung"
          name="lead"
          placeholder="Mitarbeiter auswählen"
          options={leadOptions}
        />
      </div>

      <div className="field">
        <label htmlFor="team-description" className="label">
          Beschreibung
        </label>
        <textarea
          id="team-description"
          name="description"
          className="input min-h-24 resize-none"
          placeholder="Kurzer Zweck oder Zuständigkeitsbereich"
        />
      </div>

      <TeamColorPicker />

      <p className="m-0 text-[12.5px] leading-[1.55] text-muted-2">
        Mitglieder können nach dem Erstellen direkt über die Teamdetailseite
        hinzugefügt werden.
      </p>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary">
          <Users size={15} strokeWidth={2} />
          Team erstellen
        </button>
      </div>
    </form>
  );
}

export default function CreateTeamButton() {
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => {
        openPopup({
          title: "Team erstellen",
          content: <CreateTeamForm onDone={closePopup} />,
        });
      }}
    >
      <Plus size={15} strokeWidth={2} />
      Team erstellen
    </button>
  );
}
