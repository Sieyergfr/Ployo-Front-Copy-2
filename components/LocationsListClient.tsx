"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListSearchBox } from "@/components/ListSearchBox";
import { type Location, type LocationStatus } from "@/lib/locations";
import { useTranslations } from "next-intl";

function LocationStatusBadge({ status, t }: { status: LocationStatus; t: ReturnType<typeof useTranslations> }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-[7px] bg-success/10 px-[9px] py-[3px] font-mono text-[11px] tracking-[0.3px] text-success">
        {t("active")}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-[7px] bg-[#B9B9B4]/20 px-[9px] py-[3px] font-mono text-[11px] tracking-[0.3px] text-muted-2">
      {t("inactive")}
    </span>
  );
}

function LocationCard({ location, tenant, t }: { location: Location; tenant: string; t: ReturnType<typeof useTranslations> }) {
  return (
    <Link
      href={`/u/${tenant}/standorte/${location.id}`}
      className="flex w-full cursor-pointer flex-col overflow-hidden rounded-card border border-border bg-white p-0 text-left font-sans transition-[border-color,box-shadow] duration-150 hover:border-muted hover:shadow-[0_8px_24px_rgba(0,0,0,0.05)]"
    >
      <div className={`h-1 w-full ${location.accentClassName}`} />
      <div className="w-full px-5 pt-5 pb-[18px]">
        <div className="mb-1 flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <div className="mb-[7px] font-mono text-[9.5px] uppercase tracking-[0.5px] text-muted">
              {location.kind}
            </div>
            <div className="font-display text-[18px] font-semibold leading-[1.2] tracking-[-0.4px] text-ink">
              {location.name}
            </div>
          </div>
          <LocationStatusBadge status={location.status} t={t} />
        </div>

        <div className="mt-[5px] mb-4 text-[12.5px] text-muted-2">{location.address}</div>

        <div className="flex items-center border-t border-border-soft pt-3.5">
          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="font-display text-[22px] font-semibold tracking-[-0.6px] text-ink">
              {location.employeeCount}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.4px] text-muted">
              {t("employees")}
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="font-display text-[22px] font-semibold tracking-[-0.6px] text-ink">
              {location.shiftCount}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.4px] text-muted">
              {t("shifts")}
            </span>
          </div>

          <div className="flex flex-[1.2] items-center justify-end gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-[9.5px] font-semibold text-white">
              {location.lead.initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold text-ink">
                {location.lead.name}
              </div>
              <div className="font-mono text-[9px] text-muted">{t("lead")}</div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function LocationsListClient({
  locations,
  tenant,
}: {
  locations: Location[];
  tenant: string;
}) {
  const t = useTranslations("LocationsListClient");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      return locations;
    }

    return locations.filter((location) =>
      [location.name, location.kind, location.address, location.lead.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [locations, query]);

  return (
    <>
      <ListSearchBox
        value={query}
        onChange={setQuery}
        placeholder={t("searchPlaceholder")}
        className="mb-4 max-w-[360px]"
      />

      {filtered.length > 0 ? (
        <section className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(310px,1fr))]">
          {filtered.map((location) => (
            <LocationCard key={location.dbId ?? location.id} location={location} tenant={tenant} t={t} />
          ))}
        </section>
      ) : (
        <section className="rounded-card border border-border bg-white px-6 py-10 text-center">
          <div className="font-display text-[20px] font-semibold text-ink">
            {locations.length === 0 ? t("noLocationsYet") : t("noResults")}
          </div>
          <div className="mt-2 text-[13px] text-muted-2">
            {locations.length === 0
              ? t("noLocationsYetDescription")
              : t("noResultsDescription")}
          </div>
        </section>
      )}
    </>
  );
}
