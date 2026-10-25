"use client";

import { type ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { paletteHex } from "@/lib/org-options";
import { openingHoursForWeekday, type OpeningHoursWeekday } from "@/lib/opening-hours";
import { type Location } from "@/lib/locations";
import { Building2, MapPin, Search } from "lucide-react";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations>;

const weekdays: OpeningHoursWeekday[] = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function nowInBerlin() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));

  return { weekday: weekdays[Math.max(0, weekdayIndex)], time: `${get("hour")}:${get("minute")}` };
}

/** "Geöffnet · bis 21:00 Uhr" / "Geschlossen · heute 09:00–18:00" / "Heute geschlossen". */
function openingStatus(location: Location, t: T): { open: boolean; label: string } {
  if (location.status !== "active") {
    return { open: false, label: t("statusInactive") };
  }

  const { weekday, time } = nowInBerlin();
  const day = openingHoursForWeekday(location.openingHours, weekday);

  if (day.mode === "24h") return { open: true, label: t("open24h") };
  if (day.mode === "closed" || day.ranges.length === 0) return { open: false, label: t("closedToday") };

  const current = day.ranges.find((range) =>
    range.end > range.start ? range.start <= time && time < range.end : time >= range.start || time < range.end,
  );

  if (current) return { open: true, label: t("openUntil", { time: current.end }) };

  const first = day.ranges[0];
  const last = day.ranges[day.ranges.length - 1];

  return { open: false, label: t("closedNow", { from: first.start, to: last.end }) };
}

function StatusBadge({ location, t }: { location: Location; t: T }) {
  return location.status === "active" ? (
    <span className="rounded-[7px] bg-[rgba(53,122,82,0.10)] px-2 py-[3px] text-[12px] font-semibold text-[#1f5d2c]">{t("active")}</span>
  ) : (
    <span className="rounded-[7px] bg-[#f2f1ed] px-2 py-[3px] text-[12px] font-semibold text-[#9a9a96]">{t("inactive")}</span>
  );
}

function LeadAvatar({ location, t }: { location: Location; t: T }) {
  const hasLead = location.lead.name && location.lead.name !== "Keine Leitung";

  return hasLead ? (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#2a5bc9] text-[10px] font-bold text-white">
        {location.lead.initials}
      </span>
      <span className="truncate text-[13.5px] font-semibold text-ink">{location.lead.name}</span>
    </span>
  ) : (
    <span className="flex items-center gap-2 text-[13.5px] font-medium text-[#6e6e6b]">
      <span className="size-7 rounded-full border border-dashed border-[#c9c8c3]" />
      {t("noLead")}
    </span>
  );
}

function LocationCard({ location, tenant, t }: { location: Location; tenant: string; t: T }) {
  const color = paletteHex(location.accentClassName, "#4a5568");
  const status = openingStatus(location, t);
  const inactive = location.status !== "active";

  return (
    <Link
      href={`/u/${tenant}/standorte/${location.id}`}
      className={`db-card db-insight relative flex flex-col gap-3 overflow-hidden rounded-[16px] border border-[#ecebe7] bg-white p-5 pl-6 text-ink no-underline ${inactive ? "opacity-70" : ""}`}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <span className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] text-white" style={{ background: color }}>
          <Building2 size={18} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-display text-[17px] font-semibold tracking-[-0.3px]">{location.name}</span>
          <span className="text-[13px] text-[#6e6e6b]">{location.kind}</span>
        </span>
        <StatusBadge location={location} t={t} />
      </span>
      <span className="flex items-center gap-1.5 truncate text-[13px] text-[#3d3d3a]">
        <MapPin size={14} className="shrink-0 text-[#9a9a96]" />
        <span className="truncate">{location.address}</span>
      </span>
      <span className="grid grid-cols-3 gap-2">
        {[
          [t("employees"), location.employeeCount, false],
          [t("shifts"), location.shiftCount, false],
          [t("open"), location.openPositions, location.openPositions > 0],
        ].map(([label, value, danger]) => (
          <span key={String(label)} className="flex flex-col gap-1 rounded-[10px] bg-[#fafaf8] px-3 py-2.5">
            <span className="font-mono text-[9.5px] tracking-[0.1em] text-[#9a9a96] uppercase">{label}</span>
            <span className={`font-display text-[20px] font-semibold ${danger ? "text-[#b4332a]" : ""}`}>{value}</span>
          </span>
        ))}
      </span>
      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-[#f0efeb] pt-3">
        <LeadAvatar location={location} t={t} />
        <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-[#6e6e6b]">
          <span className={`size-2 rounded-full ${status.open ? "bg-[#357a52]" : "bg-[#c9c8c3]"}`} />
          {status.label}
        </span>
      </span>
    </Link>
  );
}

export function LocationsListClient({
  locations,
  tenant,
  createTile,
}: {
  locations: Location[];
  tenant: string;
  /** "Standort anlegen"-Kachel am Ende des Rasters (nur mit Schreibrecht). */
  createTile?: ReactNode;
}) {
  const t = useTranslations("LocationsListClient");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [view, setView] = useState<"cards" | "table">("cards");
  const counts = {
    all: locations.length,
    active: locations.filter((location) => location.status === "active").length,
    inactive: locations.filter((location) => location.status !== "active").length,
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return locations
      .filter((location) => filter === "all" || (filter === "active") === (location.status === "active"))
      .filter((location) =>
        !q
          ? true
          : [location.name, location.kind, location.address, location.lead.name]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(q),
      );
  }, [locations, query, filter]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#ecebe7]">
        <nav className="flex gap-5" aria-label={t("filterLabel")}>
          {(["all", "active", "inactive"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`-mb-px inline-flex cursor-pointer items-center gap-1.5 border-0 border-b-2 bg-transparent py-3 text-[14px] ${filter === id ? "border-ink font-semibold text-ink" : "border-transparent font-medium text-[#6e6e6b]"}`}
            >
              {t(`filter.${id}`)}
              <span className="rounded-[6px] bg-[#f2f1ed] px-1.5 text-[11.5px] font-normal text-[#6e6e6b]">{counts[id]}</span>
            </button>
          ))}
        </nav>
        <span className="flex flex-wrap items-center gap-2 pb-2">
          <label className="relative block w-[300px] max-w-full">
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
        </span>
      </div>

      {filtered.length === 0 && !createTile ? (
        <section className="rounded-[16px] border border-[#ecebe7] bg-white px-6 py-10 text-center">
          <div className="font-display text-[20px] font-semibold text-ink">
            {locations.length === 0 ? t("noLocationsYet") : t("noResults")}
          </div>
          <div className="mt-2 text-[13px] text-[#6e6e6b]">
            {locations.length === 0 ? t("noLocationsYetDescription") : t("noResultsDescription")}
          </div>
        </section>
      ) : view === "cards" ? (
        <section className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(310px,1fr))]">
          {filtered.map((location) => (
            <LocationCard key={location.dbId ?? location.id} location={location} tenant={tenant} t={t} />
          ))}
          {createTile}
        </section>
      ) : (
        <section className="overflow-x-auto rounded-[16px] border border-[#ecebe7] bg-white">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="font-mono text-[10px] tracking-[0.1em] text-[#6e6e6b] uppercase">
                {["name", "address", "employees", "shifts", "open", "lead", "today"].map((column) => (
                  <th key={column} className="px-4 py-3 font-normal">
                    {t(`column.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((location) => {
                const status = openingStatus(location, t);

                return (
                  <tr key={location.dbId ?? location.id} className="border-t border-[#f0efeb] text-[13.5px]">
                    <td className="px-4 py-3">
                      <Link href={`/u/${tenant}/standorte/${location.id}`} className="flex items-center gap-2.5 font-semibold text-ink no-underline">
                        <span className="size-2.5 rounded-full" style={{ background: paletteHex(location.accentClassName, "#4a5568") }} />
                        {location.name}
                        <StatusBadge location={location} t={t} />
                      </Link>
                    </td>
                    <td className="max-w-[260px] truncate px-4 py-3 text-[#3d3d3a]">{location.address}</td>
                    <td className="px-4 py-3 font-semibold">{location.employeeCount}</td>
                    <td className="px-4 py-3 font-semibold">{location.shiftCount}</td>
                    <td className={`px-4 py-3 font-semibold ${location.openPositions > 0 ? "text-[#b4332a]" : ""}`}>{location.openPositions}</td>
                    <td className="px-4 py-3">
                      <LeadAvatar location={location} t={t} />
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-[#6e6e6b]">{status.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
