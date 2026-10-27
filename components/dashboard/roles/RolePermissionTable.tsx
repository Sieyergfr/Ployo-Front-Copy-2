"use client";

import { dbInputClass } from "@/components/dashboard/DbDrawer";
import {
  activeExtrasCount,
  areaExtras,
  areaIcons,
  levelSegmentClass,
  roleEditorFormEntries,
  visibilityOptions,
  type BooleanCapability,
  type RoleEditorState,
} from "@/components/dashboard/roles/role-editor-state";
import { permissionAreas, permissionLevels, type PermissionArea, type PermissionLevel, type PermissionScope } from "@/lib/roles";
import { ChevronDown, Search, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useMemo, useState, type Dispatch, type SetStateAction } from "react";

/** Versteckte Felder für die bestehenden Rollen-Actions. */
export function RoleEditorHiddenInputs({ state }: { state: RoleEditorState }) {
  return (
    <>
      {roleEditorFormEntries(state).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

function LevelSegments({
  area,
  level,
  onChange,
}: {
  area: PermissionArea;
  level: PermissionLevel;
  onChange: (level: PermissionLevel) => void;
}) {
  const t = useTranslations("RoleEditor");

  return (
    <div role="radiogroup" aria-label={t("levelFor", { area: area.label })} className="flex w-full gap-0.5 rounded-[10px] bg-[#f2f1ed] p-[3px]">
      {permissionLevels.map((option) => {
        const active = option === level;

        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={`db-focus min-h-8 flex-auto cursor-pointer rounded-[8px] border px-2 text-[12.5px] font-medium whitespace-nowrap transition-colors ${
              active ? levelSegmentClass[option] : "border-transparent bg-transparent text-[#6e6e6b] hover:text-ink"
            }`}
          >
            {t(`level.${option}`)}
          </button>
        );
      })}
    </div>
  );
}

function ExtraChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`db-focus min-h-8 cursor-pointer rounded-full border px-3 text-[12.5px] font-medium transition-colors ${
        active ? "border-ink bg-ink text-white" : "border-[#e4e3df] bg-white text-[#3d3d3a] hover:border-[#9a9a96]"
      }`}
    >
      {children}
    </button>
  );
}

const extraLabelKeys: Record<BooleanCapability, string> = {
  canDelete: "extraDelete",
  canViewAudit: "extraAudit",
  canUploadFiles: "extraUpload",
  canEditFiles: "extraEditFiles",
  canViewFiles: "extraViewFiles",
};

/**
 * Tabelle „Rechte pro Bereich“ (Rollendetail und „Rolle erstellen“): Stufe
 * als Segment, Sichtbarkeit als Auswahl, Zusatzrechte aufklappbar.
 */
export function RolePermissionTable({
  state,
  setState,
  toolbar = "full",
  onReset,
}: {
  state: RoleEditorState;
  setState: Dispatch<SetStateAction<RoleEditorState>>;
  /** "full": Suche + „Nur mit Zugriff“ + „Alle auf Kein Zugriff“; "reset": Suche + Zurücksetzen. */
  toolbar?: "full" | "reset";
  onReset?: () => void;
}) {
  const t = useTranslations("RoleEditor");
  const [query, setQuery] = useState("");
  const [onlyWithAccess, setOnlyWithAccess] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const visibleAreas = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de");

    return permissionAreas.filter((area) => {
      if (onlyWithAccess && (state.permissions[area.id] ?? "none") === "none") return false;
      if (!needle) return true;
      return `${area.label} ${area.description}`.toLocaleLowerCase("de").includes(needle);
    });
  }, [query, onlyWithAccess, state.permissions]);

  function setLevel(areaId: string, level: PermissionLevel) {
    setState((current) => ({ ...current, permissions: { ...current.permissions, [areaId]: level } }));
  }

  function setScope(areaId: string, scope: PermissionScope) {
    setState((current) => ({ ...current, scopes: { ...current.scopes, [areaId]: scope } }));
  }

  function toggleExtra(capability: BooleanCapability, areaId: string) {
    setState((current) => ({ ...current, [capability]: { ...current[capability], [areaId]: !current[capability][areaId] } }));
  }

  const toolbarButton = "db-act db-focus inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[10px] border border-[#ecebe7] bg-white px-3 text-[13px] font-semibold text-ink";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-[18px] pb-3.5">
        <label className="relative min-w-[180px] flex-1 sm:max-w-[220px]">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#9a9a96]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchArea")}
            aria-label={t("searchArea")}
            className={`${dbInputClass} min-h-10 bg-white py-2 pl-9`}
          />
        </label>
        {toolbar === "full" ? (
          <>
            <button
              type="button"
              aria-pressed={onlyWithAccess}
              onClick={() => setOnlyWithAccess((value) => !value)}
              className={`${toolbarButton} ${onlyWithAccess ? "!border-ink !bg-ink !text-white" : ""}`}
            >
              {t("onlyWithAccess")}
            </button>
            <button
              type="button"
              className={toolbarButton}
              onClick={() =>
                setState((current) => ({
                  ...current,
                  permissions: Object.fromEntries(permissionAreas.map((area) => [area.id, "none"])) as Record<string, PermissionLevel>,
                }))
              }
            >
              {t("allNone")}
            </button>
          </>
        ) : (
          <button type="button" className={toolbarButton} onClick={onReset}>
            {t("reset")}
          </button>
        )}
      </div>

      <div className="overflow-x-auto border-t border-[#ecebe7]">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">
              <th className="w-[32%] px-[18px] py-3 font-normal">{t("columnArea")}</th>
              <th className="w-[38%] px-2 py-3 font-normal">{t("columnLevel")}</th>
              <th className="w-[20%] px-2 py-3 font-normal">{t("columnVisibility")}</th>
              <th className="px-[18px] py-3 text-right font-normal">{t("columnExtras")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleAreas.map((area) => {
              const Icon = areaIcons[area.id] ?? ShieldCheck;
              const level = state.permissions[area.id] ?? "none";
              const hasAccess = level !== "none";
              const isChild = Boolean(area.parentAreaId);
              const options = visibilityOptions(area);
              const extras = activeExtrasCount(state, area);
              const isOpen = expanded === area.id;

              return (
                <Fragment key={area.id}>
                  <tr className={`border-t border-[#f0efeb] align-middle ${isChild ? "bg-[#fafaf8]" : ""}`}>
                    <td className={`py-3 pr-2 ${isChild ? "pl-[46px]" : "pl-[18px]"}`}>
                      <span className={`flex items-start gap-2.5 ${isChild ? "border-l border-[#e4e3df] pl-3" : ""}`}>
                        <span
                          className={`mt-0.5 flex size-[30px] shrink-0 items-center justify-center rounded-[8px] border border-[#ecebe7] ${
                            hasAccess ? "bg-white text-ink" : "bg-[#fafaf8] text-[#b5b4af]"
                          }`}
                        >
                          <Icon size={15} />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="text-[14px] font-semibold">{area.label}</span>
                          <span className="line-clamp-2 text-[12.5px] leading-[1.4] text-[#6e6e6b]" title={area.description}>
                            {area.description}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <LevelSegments area={area} level={level} onChange={(next) => setLevel(area.id, next)} />
                    </td>
                    <td className="px-2 py-3">
                      {hasAccess && options.length > 0 ? (
                        <select
                          value={state.scopes[area.id] ?? "all"}
                          onChange={(event) => setScope(area.id, event.target.value as PermissionScope)}
                          aria-label={t("visibilityFor", { area: area.label })}
                          className={`${dbInputClass} min-h-10 cursor-pointer bg-white py-2`}
                        >
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {t(`scope.${option}`)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[13px] text-[#b5b4af]">–</span>
                      )}
                    </td>
                    <td className="py-3 pr-[18px] pl-2 text-right">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={t("extrasFor", { area: area.label })}
                        onClick={() => setExpanded(isOpen ? null : area.id)}
                        className="db-focus inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-[8px] border-0 bg-transparent px-1.5 text-[12.5px] font-semibold text-[#6b4fc4] hover:bg-[#f2f1ed]"
                      >
                        {extras > 0 && `+${extras}`}
                        <ChevronDown size={15} className={`text-[#6e6e6b] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className={isChild ? "bg-[#fafaf8]" : ""}>
                      <td colSpan={4} className={`pr-[18px] pb-3.5 ${isChild ? "pl-[86px]" : "pl-[58px]"}`}>
                        {hasAccess ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {areaExtras(area).map((capability) => (
                              <ExtraChip key={capability} active={state[capability][area.id] ?? false} onClick={() => toggleExtra(capability, area.id)}>
                                {t(extraLabelKeys[capability])}
                              </ExtraChip>
                            ))}
                            {area.supportsAssignedScope && (
                              <select
                                value={state.shiftsLevel[area.id] ?? "none"}
                                onChange={(event) =>
                                  setState((current) => ({
                                    ...current,
                                    shiftsLevel: {
                                      ...current.shiftsLevel,
                                      [area.id]: event.target.value === "none" ? null : (event.target.value as PermissionLevel),
                                    },
                                  }))
                                }
                                aria-label={t("shiftsLevelLabel")}
                                className="min-h-8 cursor-pointer rounded-full border border-[#e4e3df] bg-white px-3 text-[12.5px] font-medium"
                              >
                                {permissionLevels.map((option) => (
                                  <option key={option} value={option}>
                                    {t("shiftsLevel", { level: t(`level.${option}`) })}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        ) : (
                          <span className="text-[12.5px] text-[#6e6e6b]">{t("extrasNeedAccess")}</span>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {visibleAreas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-[18px] py-8 text-center text-[13px] text-[#6e6e6b]">
                  {t("noArea")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
