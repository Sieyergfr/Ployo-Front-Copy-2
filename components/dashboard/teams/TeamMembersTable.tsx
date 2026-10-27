"use client";

import { avatarColor } from "@/components/dashboard/ui";
import { Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

export type TeamMemberRow = {
  key: string;
  name: string;
  initials: string;
  isLead: boolean;
  location: string;
  locationColor: string;
  role: string;
  contract: string;
  status: "active" | "vacation" | "absent";
  href?: string;
  actions?: ReactNode;
};

const statusTone: Record<TeamMemberRow["status"], string> = {
  active: "bg-[rgba(47,122,74,0.12)] text-[#1f5d2c]",
  vacation: "bg-[rgba(30,130,140,0.12)] text-[#16676f]",
  absent: "bg-[rgba(180,51,42,0.10)] text-[#b4332a]",
};

/** Mitgliederliste der Team-Detailseite mit Suche (Name, Standort, Rolle, Vertrag). */
export default function TeamMembersTable({
  rows,
  toolbar,
  editor,
}: {
  rows: TeamMemberRow[];
  /** Rechts neben der Suche, z. B. "Mitglieder hinzufügen". */
  toolbar?: ReactNode;
  /** Zusätzliche Zeile unter dem Kopf (Bearbeiten-Modus). */
  editor?: ReactNode;
}) {
  const t = useTranslations("TeamDetailPage");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? rows.filter((row) => [row.name, row.location, row.role, row.contract].some((value) => value.toLowerCase().includes(needle)))
    : rows;

  return (
    <section className="db-card overflow-hidden rounded-[16px] border border-[#ecebe7] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-[18px] pt-4 pb-3.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="m-0 font-display text-[17px] font-semibold tracking-[-0.3px]">{t("teamMembers")}</h2>
          <span className="text-[13px] text-[#6e6e6b]">{t("membersSubtitle")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative block w-[220px] max-w-full">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#9a9a96]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="db-input box-border h-10 w-full rounded-[10px] border border-[#e4e3df] bg-white pr-3 pl-9 text-[13.5px]"
            />
          </label>
          {toolbar}
        </div>
      </div>
      {editor}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-[13.5px]">
          <thead>
            <tr className="bg-[#fafaf8] font-mono text-[10px] tracking-[0.12em] text-[#6e6e6b] uppercase">
              <th className="px-[18px] py-2.5 font-medium">{t("columnName")}</th>
              <th className="px-3 py-2.5 font-medium">{t("columnLocation")}</th>
              <th className="px-3 py-2.5 font-medium">{t("roleInTeam")}</th>
              <th className="px-3 py-2.5 font-medium">{t("columnContract")}</th>
              <th className="px-3 py-2.5 font-medium">{t("columnStatus")}</th>
              <th className="px-[18px] py-2.5">
                <span className="sr-only">{t("columnAction")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.key} className="border-t border-[#f0efeb]">
                <td className="px-[18px] py-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex size-[30px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                      style={{ background: avatarColor(row.name) }}
                    >
                      {row.initials}
                    </span>
                    {row.href ? (
                      <Link href={row.href} className="truncate font-semibold text-ink no-underline hover:underline">
                        {row.name}
                      </Link>
                    ) : (
                      <span className="truncate font-semibold">{row.name}</span>
                    )}
                    {row.isLead && (
                      <span className="shrink-0 rounded-[5px] bg-[rgba(139,111,224,0.12)] px-1.5 text-[11px] font-semibold text-[#6b4fc4]">
                        {t("teamLead")}
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-3">
                  {row.location ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-[7px] shrink-0 rounded-[2px]" style={{ background: row.locationColor }} />
                      {row.location}
                    </span>
                  ) : (
                    <span className="text-[#9a9a96]">–</span>
                  )}
                </td>
                <td className="px-3 py-3">{row.role || "–"}</td>
                <td className="px-3 py-3 text-[#6e6e6b]">{row.contract || "–"}</td>
                <td className="px-3 py-3">
                  <span className={`rounded-[6px] px-2 py-[3px] text-[12px] font-semibold ${statusTone[row.status]}`}>
                    {t(`status.${row.status}`)}
                  </span>
                </td>
                <td className="px-[18px] py-3">
                  <span className="flex items-center justify-end gap-1.5">{row.actions}</span>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-[18px] py-8 text-center text-[13.5px] text-[#6e6e6b]">
                  {rows.length === 0 ? t("noMembers") : t("noSearchResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
