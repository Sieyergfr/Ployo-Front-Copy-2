"use client";

import { Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

type RoleId = "hr" | "payroll" | "lead" | "staff";
type Level = "manage" | "write" | "read" | "none";
type Scope = "all" | "team" | "own" | "none";
// Beschriftung des Zugriffs-Badges (Schreib-Varianten heißen je Bereich anders).
type AccessLabel = "manage" | "write" | "read" | "request" | "report" | "record";

const roles: RoleId[] = ["hr", "payroll", "lead", "staff"];

const modules = [
  "masterData",
  "contracts",
  "payroll",
  "sensitiveData",
  "vacation",
  "sickness",
  "shiftPlanning",
  "timeTracking",
] as const;

// Beispielhafte Vorlagen-Rollen für die Landingpage, Reihenfolge wie `modules`.
const permissions: Record<RoleId, [Level, AccessLabel, Scope][]> = {
  hr: [
    ["manage", "manage", "all"],
    ["manage", "manage", "all"],
    ["manage", "manage", "all"],
    ["manage", "manage", "all"],
    ["manage", "manage", "all"],
    ["manage", "manage", "all"],
    ["write", "write", "none"],
    ["manage", "manage", "all"],
  ],
  payroll: [
    ["read", "read", "all"],
    ["write", "write", "all"],
    ["manage", "manage", "all"],
    ["manage", "manage", "all"],
    ["read", "read", "all"],
    ["read", "read", "all"],
    ["read", "read", "none"],
    ["read", "read", "all"],
  ],
  lead: [
    ["read", "read", "team"],
    ["none", "read", "none"],
    ["none", "read", "none"],
    ["none", "read", "none"],
    ["write", "write", "team"],
    ["read", "read", "team"],
    ["manage", "manage", "none"],
    ["write", "write", "team"],
  ],
  staff: [
    ["read", "read", "team"],
    ["read", "read", "own"],
    ["read", "read", "own"],
    ["read", "read", "own"],
    ["write", "request", "own"],
    ["write", "report", "own"],
    ["read", "read", "none"],
    ["write", "record", "own"],
  ],
};

// Volle Klassennamen literal, damit Tailwinds Scanner sie findet.
const badgeClasses: Record<Exclude<Level, "none">, { badge: string; dot: string }> = {
  manage: {
    badge: "text-success bg-success/10 border-success/25",
    dot: "bg-success",
  },
  write: {
    badge: "text-[#2a6fdb] bg-[#2a6fdb]/10 border-[#2a6fdb]/25",
    dot: "bg-[#2a6fdb]",
  },
  read: {
    badge: "text-[#5c6b7a] bg-[#5c6b7a]/[0.08] border-[#5c6b7a]/20",
    dot: "bg-[#5c6b7a]",
  },
};

export default function RolePermissions() {
  const t = useTranslations("LandingPage.roles");
  const [roleId, setRoleId] = useState<RoleId>("lead");

  return (
    <div className="pl-card pl-glass relative flex flex-col gap-5 overflow-hidden rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.6px] text-muted-2">
          {t("pickRole")}
        </span>
        <div
          role="tablist"
          aria-label={t("roleTablist")}
          className="flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-ink/[0.045] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {roles.map((id) => {
            const selected = id === roleId;

            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setRoleId(id)}
                className={`pl-focus min-h-9 shrink-0 cursor-pointer rounded-[7px] border-0 px-3.5 py-2 text-[13px] whitespace-nowrap ${
                  selected
                    ? "pl-tab-active bg-white font-semibold text-ink"
                    : "pl-tab bg-transparent font-medium text-muted-2"
                }`}
              >
                {t(`${id}.label`)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-[rgba(228,227,223,0.8)] bg-[rgba(250,250,248,0.75)] px-4 py-3.5">
        <span className="pl-icon-flat flex size-9 shrink-0 items-center justify-center rounded-[9px] text-[#7a3c9c]">
          <Shield size={17} strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-display text-[14.5px] font-semibold tracking-[-0.2px] text-ink">
            {t(`${roleId}.label`)}
          </span>
          <span className="text-[13px] leading-normal text-muted-2">{t(`${roleId}.description`)}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3 px-4 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted-2 min-[521px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <span>{t("columnArea")}</span>
          <span>{t("columnAccess")}</span>
          <span className="max-[520px]:hidden">{t("columnScope")}</span>
        </div>
        {modules.map((module, index) => {
          const [level, label, scope] = permissions[roleId][index];

          return (
            <div
              key={module}
              className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-center gap-3 border-t border-border-soft px-4 py-3 min-[521px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]"
            >
              <span className="text-[13.5px] font-medium text-ink">{t(`modules.${module}`)}</span>
              <span>
                {level === "none" ? (
                  <span className="text-[12.5px] text-muted-2">{t("noAccess")}</span>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-[7px] border px-2 py-[3px] text-[12px] font-medium whitespace-nowrap ${badgeClasses[level].badge}`}
                  >
                    <span className={`size-1.5 rounded-full ${badgeClasses[level].dot}`} />
                    {t(`access.${label}`)}
                  </span>
                )}
              </span>
              <span className="text-[12.5px] text-muted-2 max-[520px]:hidden">
                {t(`scopes.${scope}`)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="m-0 px-1 text-[12.5px] leading-normal text-muted-2">{t("footnote")}</p>
    </div>
  );
}
