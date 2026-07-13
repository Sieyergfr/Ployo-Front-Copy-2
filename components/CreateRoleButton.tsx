"use client";

import { createRoleAction } from "@/app/(dashboard)/u/[tenant]/rollen/actions";
import { useUniversalPopup } from "@/components/UniversalPopup";
import {
  emptyPermissionSet,
  permissionAreas,
  permissionLevelLabels,
  permissionLevels,
  type PermissionLevel,
} from "@/lib/roles";
import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  Landmark,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  ScrollText,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

type RoleTemplate = {
  id: string;
  label: string;
  permissions: Partial<Record<string, PermissionLevel>>;
};

const roleTemplates: RoleTemplate[] = [
  {
    id: "location-lead",
    label: "Standortleitung",
    permissions: {
      employees: "read",
      locations: "write",
      teams: "write",
      files: "read",
      vacation: "write",
      sickness: "read",
      shifts: "admin",
      reminders: "write",
    },
  },
  {
    id: "hr-team",
    label: "HR-Team",
    permissions: {
      employees: "write",
      payroll: "read",
      locations: "read",
      teams: "read",
      files: "write",
      vacation: "admin",
      sickness: "write",
      reminders: "write",
      audit: "read",
      roles: "read",
    },
  },
  {
    id: "employee-service",
    label: "Mitarbeiter (Self-Service)",
    permissions: {
      employees: "read",
      payroll: "read",
      teams: "read",
      files: "read",
      vacation: "write",
      sickness: "write",
      shifts: "read",
      reminders: "read",
    },
  },
];

const areaIcons: Record<string, LucideIcon> = {
  employees: UsersRound,
  payroll: Landmark,
  locations: MapPin,
  teams: BriefcaseBusiness,
  files: FileText,
  vacation: CalendarDays,
  sickness: CalendarDays,
  shifts: CalendarDays,
  reminders: Bell,
  audit: ScrollText,
  roles: ShieldCheck,
  settings: Settings,
};

const permissionTone: Record<PermissionLevel, string> = {
  none: "text-muted",
  read: "text-[#2A6FDB]",
  write: "text-success",
  admin: "text-danger",
};

function permissionsForTemplate(template: RoleTemplate): Record<string, PermissionLevel> {
  const permissions = emptyPermissionSet();

  Object.entries(template.permissions).forEach(([areaId, level]) => {
    if (level) {
      permissions[areaId] = level;
    }
  });

  return permissions;
}

function CreateRoleForm({
  tenant,
  onClose,
}: {
  tenant: string;
  onClose: () => void;
}) {
  const defaultTemplate = roleTemplates[2] ?? roleTemplates[0];
  const [activeTemplateId, setActiveTemplateId] = useState(defaultTemplate.id);
  const [permissions, setPermissions] = useState<Record<string, PermissionLevel>>(
    () => permissionsForTemplate(defaultTemplate),
  );
  const [query, setQuery] = useState("");

  const filteredAreas = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return permissionAreas;
    }

    return permissionAreas.filter((area) =>
      `${area.label} ${area.description}`.toLowerCase().includes(normalizedQuery),
    );
  }, [query]);

  const configuredCount = useMemo(
    () => Object.values(permissions).filter((level) => level !== "none").length,
    [permissions],
  );

  const summary = useMemo(
    () => ({
      read: Object.values(permissions).filter((level) => level === "read").length,
      write: Object.values(permissions).filter((level) => level === "write").length,
      admin: Object.values(permissions).filter((level) => level === "admin").length,
    }),
    [permissions],
  );

  return (
    <form action={createRoleAction} className="flex max-h-[92svh] flex-col overflow-hidden">
      <input type="hidden" name="tenant" value={tenant} />
      {permissionAreas.map((area) => (
        <input
          key={area.id}
          type="hidden"
          name={`permission-${area.id}`}
          value={permissions[area.id] ?? "none"}
        />
      ))}

      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            Neue Rolle · {configuredCount} von {permissionAreas.length} Bereichen konfiguriert
          </div>
          <h2 className="mt-1 font-display text-[24px] font-semibold leading-tight text-ink">
            Rolle erstellen
          </h2>
        </div>
        <button
          type="button"
          aria-label="Popup schließen"
          title="Schließen"
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
          onClick={onClose}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="role-name" className="label">
              Rollenname
            </label>
            <input
              id="role-name"
              name="name"
              className="input"
              placeholder="z. B. Standortleitung"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="role-description" className="label">
              Beschreibung
            </label>
            <input
              id="role-description"
              name="description"
              className="input"
              placeholder="Kurzbeschreibung"
            />
          </div>
        </div>

        <section className="mt-5">
          <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            Vorlage anwenden
          </div>
          <div className="flex flex-wrap gap-2">
            {roleTemplates.map((template) => {
              const isActive = activeTemplateId === template.id;

              return (
                <button
                  key={template.id}
                  type="button"
                  className={[
                    "rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-colors",
                    isActive
                      ? "border-ink bg-ink text-white"
                      : "border-border bg-white text-ink hover:border-muted hover:bg-bg",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    setActiveTemplateId(template.id);
                    setPermissions(permissionsForTemplate(template));
                  }}
                >
                  {template.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-[18px] border border-border bg-white">
          <div className="flex flex-col gap-3 border-b border-border bg-[#FAFAF8] px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-[15px] font-semibold text-ink">
                Rechte je Bereich
              </h3>
              <p className="mt-0.5 text-[12px] leading-[1.4] text-muted">
                Lege fest, welche Bereiche diese Rolle sehen oder bearbeiten darf.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative min-w-0 sm:w-[220px]">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-9 w-full rounded-[10px] border border-border bg-white pl-9 pr-3 text-[13px] outline-none transition-colors placeholder:text-muted-2 focus:border-ink"
                  placeholder="Bereich suchen..."
                />
              </label>
              <button
                type="button"
                className="flex h-9 items-center justify-center gap-2 rounded-[10px] border border-border bg-white px-3 text-[12.5px] font-semibold text-ink transition-colors hover:border-muted hover:bg-bg"
                onClick={() => {
                  setActiveTemplateId("");
                  setPermissions(emptyPermissionSet());
                }}
              >
                <RotateCcw size={14} />
                Zurücksetzen
              </button>
            </div>
          </div>

          <div>
            {filteredAreas.length > 0 ? (
              filteredAreas.map((area) => {
                const Icon = areaIcons[area.id] ?? ShieldCheck;
                const selectedPermission = permissions[area.id] ?? "none";

                return (
                  <div
                    key={area.id}
                    className="flex flex-col gap-3 border-t border-border-soft px-4 py-3 first:border-t-0 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-border bg-bg text-ink">
                        <Icon size={17} strokeWidth={2} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-ink">
                          {area.label}
                        </div>
                        <div className="mt-0.5 text-[12px] leading-[1.35] text-muted">
                          {area.description}
                        </div>
                      </div>
                    </div>

                    <div className="grid w-full grid-cols-4 rounded-[12px] border border-border bg-bg p-1 md:w-[336px]">
                      {permissionLevels.map((level) => {
                        const isSelected = selectedPermission === level;

                        return (
                          <button
                            key={level}
                            type="button"
                            className={[
                              "h-8 rounded-[9px] px-2 text-[11.5px] font-semibold transition-colors",
                              isSelected
                                ? `bg-white shadow-sm ${permissionTone[level]}`
                                : "text-muted hover:bg-white/70 hover:text-ink",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onClick={() => {
                              setActiveTemplateId("");
                              setPermissions((current) => ({
                                ...current,
                                [area.id]: level,
                              }));
                            }}
                          >
                            {level === "none"
                              ? "Kein"
                              : permissionLevelLabels[level]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-8 text-center text-[13px] text-muted">
                Kein Bereich gefunden.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-3 border-t border-border bg-white px-6 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-[#2A6FDB]/10 px-3 py-1.5 text-[12px] font-semibold text-[#2A6FDB]">
            {summary.read} Lesen
          </span>
          <span className="rounded-full bg-success/10 px-3 py-1.5 text-[12px] font-semibold text-success">
            {summary.write} Schreiben
          </span>
          <span className="rounded-full bg-danger/10 px-3 py-1.5 text-[12px] font-semibold text-danger">
            {summary.admin} Admin
          </span>
        </div>
        <div className="flex justify-end gap-2.5">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary">
            <ShieldCheck size={15} />
            Rolle erstellen
          </button>
        </div>
      </div>
    </form>
  );
}

export default function CreateRoleButton({ tenant }: { tenant: string }) {
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() =>
        openPopup({
          className:
            "max-w-[780px] !overflow-hidden rounded-[18px] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.24)]",
          contentClassName: "",
          hideCloseButton: true,
          content: <CreateRoleForm tenant={tenant} onClose={closePopup} />,
        })
      }
    >
      <Plus size={15} />
      Rolle erstellen
    </button>
  );
}
