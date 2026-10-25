"use client";

import { type ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { paletteHex } from "@/lib/org-options";
import { type Team, type TeamMember } from "@/lib/teams";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations>;

function MemberStack({ members, color }: { members: TeamMember[]; color: string }) {
  const shown = members.slice(0, 5);

  return (
    <span className="flex items-center">
      {shown.map((member, index) => (
        <span
          key={member.id ?? `${member.initials}-${index}`}
          title={member.name}
          className="-ml-1.5 flex size-7 items-center justify-center rounded-full border-2 border-white text-[9.5px] font-bold text-white first:ml-0"
          style={{ background: color }}
        >
          {member.initials}
        </span>
      ))}
      {members.length > shown.length && (
        <span className="-ml-1.5 flex size-7 items-center justify-center rounded-full border-2 border-white bg-[#f2f1ed] text-[10px] font-semibold text-[#6e6e6b]">
          +{members.length - shown.length}
        </span>
      )}
    </span>
  );
}

function locationList(team: Team) {
  return team.locations
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function TeamCard({ team, tenant, locationColors, t }: { team: Team; tenant: string; locationColors: Record<string, string>; t: T }) {
  const color = paletteHex(team.colorClassName, "#4a5568");
  const absent = team.members.filter((member) => member.status === "vacation").length;
  const onDuty = team.members.length - absent;
  const locations = locationList(team);
  const hasLead = Boolean(team.lead.name) && team.lead.initials !== "--";

  return (
    <Link
      href={`/u/${tenant}/teams/${team.id}`}
      className="db-card db-insight relative flex flex-col gap-3 overflow-hidden rounded-[16px] border border-[#ecebe7] bg-white p-5 pl-6 text-ink no-underline"
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <span className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] text-white" style={{ background: color }}>
          <Users size={18} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-display text-[17px] font-semibold tracking-[-0.3px]">{team.name}</span>
          <span className={`text-[13px] ${team.members.length === 0 ? "text-[#1f5d2c]" : absent ? "text-[#9a5b00]" : "text-[#1f5d2c]"}`}>
            {team.members.length === 0
              ? t("noMembers")
              : absent
                ? t("onDutyAbsent", { onDuty, absent })
                : t("onDuty", { count: onDuty })}
          </span>
        </span>
      </span>
      <span className={`line-clamp-2 min-h-[38px] text-[13.5px] leading-[1.45] ${team.description ? "text-[#3d3d3a]" : "text-[#9a9a96]"}`}>
        {team.description || t("noDescription")}
      </span>
      <span className="flex flex-wrap gap-1.5">
        {locations.length === 0 ? (
          <span className="text-[12.5px] text-[#9a9a96]">{t("noLocations")}</span>
        ) : (
          <>
            {locations.slice(0, 2).map((name) => (
              <span key={name} className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#ecebe7] px-2 py-[3px] text-[12px] font-medium">
                <span className="size-1.5 rounded-[2px]" style={{ background: locationColors[name] ?? "#9a9a96" }} />
                {name}
              </span>
            ))}
            {locations.length > 2 && (
              <span className="rounded-[7px] bg-[rgba(139,110,212,0.10)] px-2 py-[3px] text-[12px] font-semibold text-[#6b4fc4]">
                +{locations.length - 2}
              </span>
            )}
          </>
        )}
      </span>
      <span className="mt-auto flex items-center justify-between gap-3 border-t border-[#f0efeb] pt-3">
        <span className="flex min-w-0 items-center gap-2">
          {hasLead ? (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: color }}>
              {team.lead.initials}
            </span>
          ) : (
            <span className="size-7 shrink-0 rounded-full border border-dashed border-[#c9c8c3]" />
          )}
          <span className="flex min-w-0 flex-col">
            <span className="font-mono text-[9px] tracking-[0.1em] text-[#9a9a96] uppercase">{t("teamLead")}</span>
            <span className="truncate text-[13.5px] font-semibold">{hasLead ? team.lead.name : t("noLead")}</span>
          </span>
        </span>
        {team.members.length > 0 ? (
          <MemberStack members={team.members} color={color} />
        ) : (
          <span className="text-[12.5px] text-[#6e6e6b]">{t("memberCount", { count: 0 })}</span>
        )}
      </span>
    </Link>
  );
}

export function TeamsListClient({
  teams,
  tenant,
  locationColors = {},
  createTile,
}: {
  teams: Team[];
  tenant: string;
  /** Standortname → Farbe für die Standort-Chips. */
  locationColors?: Record<string, string>;
  createTile?: ReactNode;
}) {
  const t = useTranslations("TeamsListClient");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      return teams;
    }

    return teams.filter((team) =>
      [team.name, team.locations, team.lead.name, ...team.members.map((member) => member.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [teams, query]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <label className="relative block w-[340px] max-w-full">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#9a9a96]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="db-input box-border h-10 w-full rounded-[10px] border border-[#e4e3df] bg-white pr-3 pl-9 text-[13.5px]"
          />
        </label>
        <span className="inline-flex gap-0.5 rounded-[10px] bg-[#f2f1ed] p-1">
          {(["cards", "table"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`min-h-8 cursor-pointer rounded-[7px] border-0 px-3 text-[13px] font-semibold ${view === id ? "bg-white text-ink shadow-[0_1px_2px_rgba(14,14,14,0.08)]" : "bg-transparent text-[#6e6e6b]"}`}
            >
              {t(`view.${id}`)}
            </button>
          ))}
        </span>
      </div>

      {filtered.length === 0 && !createTile ? (
        <section className="rounded-[16px] border border-[#ecebe7] bg-white px-6 py-10 text-center">
          <div className="font-display text-[20px] font-semibold text-ink">{teams.length === 0 ? t("noTeamsYet") : t("noResults")}</div>
          <div className="mt-2 text-[13px] text-[#6e6e6b]">{teams.length === 0 ? t("noTeamsYetDescription") : t("noResultsDescription")}</div>
        </section>
      ) : view === "cards" ? (
        <section className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(310px,1fr))]">
          {filtered.map((team) => (
            <TeamCard key={team.dbId ?? team.id} team={team} tenant={tenant} locationColors={locationColors} t={t} />
          ))}
          {createTile}
        </section>
      ) : (
        <section className="overflow-x-auto rounded-[16px] border border-[#ecebe7] bg-white">
          <table className="w-full min-w-[700px] border-collapse text-left">
            <thead>
              <tr className="font-mono text-[10px] tracking-[0.1em] text-[#6e6e6b] uppercase">
                {["name", "locations", "lead", "members"].map((column) => (
                  <th key={column} className="px-4 py-3 font-normal">
                    {t(`column.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((team) => (
                <tr key={team.dbId ?? team.id} className="border-t border-[#f0efeb] text-[13.5px]">
                  <td className="px-4 py-3">
                    <Link href={`/u/${tenant}/teams/${team.id}`} className="flex items-center gap-2.5 font-semibold text-ink no-underline">
                      <span className="size-2.5 rounded-full" style={{ background: paletteHex(team.colorClassName, "#4a5568") }} />
                      {team.name}
                    </Link>
                  </td>
                  <td className="max-w-[260px] truncate px-4 py-3 text-[#3d3d3a]">{team.locations || "–"}</td>
                  <td className="px-4 py-3">{team.lead.initials !== "--" && team.lead.name ? team.lead.name : t("noLead")}</td>
                  <td className="px-4 py-3 font-semibold">{team.members.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
