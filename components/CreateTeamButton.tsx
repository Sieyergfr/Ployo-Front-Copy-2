"use client";

import { createTeamAction } from "@/app/(dashboard)/u/[tenant]/teams/actions";
import { DbField, DbModal, dbInputClass } from "@/components/dashboard/DbDrawer";
import { avatarColor, ctaClass, secondaryClass } from "@/components/dashboard/ui";
import { LocationMultiSelectDropdown } from "@/components/TeamEditControls";
import { useActionStateWithToast } from "@/components/Toasts";
import { paletteHex, teamColorPalette } from "@/lib/org-options";
import { Check, Plus, Search, Users } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

type DropdownOption = {
  value: string;
  label: string;
  meta?: string;
};

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function LeadPicker({ employees }: { employees: DropdownOption[] }) {
  const t = useTranslations("CreateTeamButton");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? employees.filter((employee) => `${employee.label} ${employee.meta ?? ""}`.toLowerCase().includes(needle))
    : employees;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">{t("teamLead")}</span>
      <input type="hidden" name="lead" value={selected} />
      <label className="relative block">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#9a9a96]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("selectEmployeePlaceholder")}
          aria-label={t("selectEmployeePlaceholder")}
          className={`${dbInputClass} pl-9`}
        />
      </label>
      <div role="listbox" aria-label={t("teamLead")} className="flex max-h-[200px] flex-col overflow-y-auto">
        {visible.map((employee) => {
          const isSelected = employee.value === selected;

          return (
            <button
              key={employee.value}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => setSelected(isSelected ? "" : employee.value)}
              className={`db-focus flex min-h-12 cursor-pointer items-center gap-2.5 rounded-[10px] border-0 px-2 text-left ${
                isSelected ? "bg-[rgba(139,111,224,0.10)]" : "bg-transparent hover:bg-[#f6f5f2]"
              }`}
            >
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold text-white"
                style={{ background: avatarColor(employee.label) }}
              >
                {initialsOf(employee.label)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{employee.label}</span>
              {employee.meta && <span className="truncate text-[12.5px] text-[#6e6e6b]">{employee.meta}</span>}
              {isSelected && <Check size={15} className="shrink-0 text-[#6b4fc4]" />}
            </button>
          );
        })}
        {visible.length === 0 && <span className="px-2 py-3 text-[13px] text-[#6e6e6b]">{t("noEmployeeFound")}</span>}
      </div>
      <span className="text-[12px] text-[#6e6e6b]">{t("teamLeadHint")}</span>
    </div>
  );
}

function CreateTeamModal({
  tenant,
  employees,
  locations,
  onClose,
}: {
  tenant: string;
  employees: DropdownOption[];
  locations: string[];
  onClose: () => void;
}) {
  const t = useTranslations("CreateTeamButton");
  const [, formAction, isPending] = useActionStateWithToast(createTeamAction);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(teamColorPalette[0].value);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const colorEntry = teamColorPalette.find((entry) => entry.value === color) ?? teamColorPalette[0];
  const accent = paletteHex(colorEntry.className);

  return (
    <DbModal
      title={
        <span className="flex flex-col gap-1">
          <span className="font-mono text-[10px] font-medium tracking-[0.12em] text-[#6e6e6b] uppercase">{t("eyebrow")}</span>
          {t("createTeam")}
        </span>
      }
      onClose={onClose}
    >
      <form action={formAction} className="flex flex-col gap-[18px]">
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="color" value={color} />

        <div className="relative flex items-center gap-3.5 overflow-hidden rounded-[14px] border border-[#ecebe7] bg-white py-3.5 pr-4 pl-5">
          <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] text-white" style={{ background: accent }}>
            <Users size={18} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-semibold">{name.trim() || t("newTeam")}</span>
            <span className="truncate text-[13px] text-[#6e6e6b]">
              {selectedLocations.length > 0 ? selectedLocations.join(", ") : t("noLocations")}
            </span>
          </span>
          <span className="font-mono text-[10px] tracking-[0.12em] text-[#6e6e6b] uppercase">{t("preview")}</span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">
            {t("teamColor")} · {colorEntry.label}
          </span>
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t("teamColor")}>
            {teamColorPalette.map((entry) => (
              <button
                key={entry.value}
                type="button"
                role="radio"
                aria-checked={color === entry.value}
                aria-label={entry.label}
                title={entry.label}
                onClick={() => setColor(entry.value)}
                className={`db-focus flex size-7 cursor-pointer items-center justify-center rounded-full border-0 text-white ${
                  color === entry.value ? "ring-2 ring-offset-2" : ""
                }`}
                style={{ background: paletteHex(entry.className), ["--tw-ring-color" as string]: paletteHex(entry.className) }}
              >
                {color === entry.value && <Check size={13} strokeWidth={3} aria-hidden="true" />}
              </button>
            ))}
          </div>
          <span className="text-[12px] text-[#6e6e6b]">{t("teamColorHint")}</span>
        </div>

        <DbField label={`${t("teamName")} *`}>
          <input
            name="name"
            className={dbInputClass}
            placeholder={t("teamNamePlaceholder")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={80}
            autoFocus
          />
        </DbField>

        <LeadPicker employees={employees} />

        <DbField label={t("description")}>
          <textarea name="description" className={`${dbInputClass} min-h-20 resize-y`} placeholder={t("descriptionPlaceholder")} maxLength={500} />
        </DbField>

        <div className="flex flex-col gap-1.5">
          <LocationMultiSelectDropdown
            defaultLocations={[]}
            options={locations}
            label={t("locations")}
            placeholder={t("noLocations")}
            onChange={setSelectedLocations}
          />
          <span className="text-[12px] text-[#6e6e6b]">{t("locationsHint")}</span>
        </div>

        <p className="m-0 text-[12.5px] leading-[1.55] text-[#6e6e6b]">{t("membersHint")}</p>

        <div className="flex justify-end gap-2 border-t border-[#ecebe7] pt-4">
          <button type="button" className={secondaryClass} onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" className={ctaClass} disabled={isPending}>
            {isPending ? t("creatingTeam") : t("createTeam")}
          </button>
        </div>
      </form>
    </DbModal>
  );
}

export default function CreateTeamButton({
  tenant,
  initialOpen = false,
  employees,
  locations,
  className,
  children,
}: {
  tenant: string;
  initialOpen?: boolean;
  employees: DropdownOption[];
  locations: string[];
  className?: string;
  /** Eigener Inhalt, z. B. die gestrichelte Kachel im Kartenraster. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("CreateTeamButton");
  const [open, setOpen] = useState(initialOpen);

  return (
    <>
      <button type="button" className={className ?? ctaClass} onClick={() => setOpen(true)}>
        {children ?? (
          <>
            <Plus size={15} strokeWidth={2} />
            {t("createTeam")}
          </>
        )}
      </button>
      {open && <CreateTeamModal tenant={tenant} employees={employees} locations={locations} onClose={() => setOpen(false)} />}
    </>
  );
}
