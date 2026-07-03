import CreateLocationButton from "@/components/CreateLocationButton";
import PageHeader from "@/components/PageHeader";
import {
  locationMetrics,
  locations,
  type Location,
  type LocationMetric,
  type LocationStatus,
} from "@/lib/locations";
import Link from "next/link";

export const metadata = {
  title: "Standorte",
};

function LocationMetricCard({
  label,
  value,
  caption,
  tone,
}: LocationMetric) {
  return (
    <div className="rounded-[14px] border border-border bg-white px-5 pt-5 pb-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.6px] text-muted">
        {label}
      </div>
      <div className="my-[14px] mb-[9px] font-display text-[38px] font-semibold leading-none tracking-[-1.2px] text-ink">
        {value}
      </div>
      <div
        className={`text-[12px] ${tone === "danger" ? "text-danger" : "text-muted"}`}
      >
        {caption}
      </div>
    </div>
  );
}

function LocationStatusBadge({ status }: { status: LocationStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-[7px] bg-success/10 px-[9px] py-[3px] font-mono text-[11px] tracking-[0.3px] text-success">
        Aktiv
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-[7px] bg-[#B9B9B4]/20 px-[9px] py-[3px] font-mono text-[11px] tracking-[0.3px] text-muted-2">
      Inaktiv
    </span>
  );
}

function LocationCard({
  location,
  tenant,
}: {
  location: Location;
  tenant: string;
}) {
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
          <LocationStatusBadge status={location.status} />
        </div>

        <div className="mt-[5px] mb-4 text-[12.5px] text-muted-2">
          {location.address}
        </div>

        <div className="flex items-center border-t border-border-soft pt-3.5">
          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="font-display text-[22px] font-semibold tracking-[-0.6px] text-ink">
              {location.employeeCount}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.4px] text-muted">
              Mitarbeiter
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="font-display text-[22px] font-semibold tracking-[-0.6px] text-ink">
              {location.shiftCount}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.4px] text-muted">
              Schichten
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
              <div className="font-mono text-[9px] text-muted">Leitung</div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default async function LocationsPage({
  params,
}: PageProps<"/u/[tenant]/standorte">) {
  const { tenant } = await params;

  return (
    <>
      <PageHeader eyebrow="Unternehmensstruktur" title="Standorte">
        <CreateLocationButton />
      </PageHeader>

      <section className="mb-7 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        {locationMetrics.map((metric) => (
          <LocationMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(310px,1fr))]">
        {locations.map((location) => (
          <LocationCard key={location.id} location={location} tenant={tenant} />
        ))}
      </section>

      <div className="mt-8 text-center font-mono text-[10px] tracking-[0.4px] text-[#B0B0AB]">
        Ployo {"\u00b7"} Personalakte-System {"\u00b7"} Alle Zugriffe
        protokolliert {"\u00b7"} Server in Frankfurt
      </div>
    </>
  );
}
