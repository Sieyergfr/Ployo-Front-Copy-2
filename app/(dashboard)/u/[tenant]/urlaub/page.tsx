import { VacationRequestButton } from "@/components/AbsenceActionButtons";
import { VacationDrawerButton } from "@/components/ActionDrawers";
import PageHeader from "@/components/PageHeader";
import {
  approveVacationRequestAction,
  rejectVacationRequestAction,
} from "@/app/(dashboard)/u/[tenant]/urlaub/actions";
import { getEmployeesForTenant } from "@/lib/employee-service";
import {
  getVacationMetrics,
  getVacationRequestsForTenant,
} from "@/lib/vacation-service";
import {
  vacationStatusConfig,
  type VacationMetric,
  type VacationRequest,
} from "@/lib/vacations";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export const metadata = {
  title: "Urlaub",
};

const filters = ["Alle", "Ausstehend", "Genehmigt", "Abgelehnt"];

function VacationMetricCard({ label, value, caption, tone }: VacationMetric) {
  const valueClassName =
    tone === "warning"
      ? "text-warning"
      : tone === "success"
        ? "text-success"
        : "text-ink";

  return (
    <div className="rounded-[14px] border border-border bg-white px-[22px] pt-5 pb-4">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.6px] text-muted">
        {label}
      </div>
      <div
        className={`mt-4 mb-2 font-display text-[38px] font-semibold leading-none tracking-[-1.2px] ${valueClassName}`}
      >
        {value}
      </div>
      <div className="text-[12px] text-muted">{caption}</div>
    </div>
  );
}

function VacationStatusBadge({ status }: { status: VacationRequest["status"] }) {
  const config = vacationStatusConfig[status];

  return (
    <span
      className={`inline-flex items-center rounded-[7px] px-[9px] py-[3px] font-mono text-[10.5px] ${config.className}`}
    >
      {config.badge}
    </span>
  );
}

function DecisionForm({
  tenant,
  request,
  action,
  children,
  className,
}: {
  tenant: string;
  request: VacationRequest;
  action: (formData: FormData) => Promise<void>;
  children: ReactNode;
  className: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="requestId" value={request.dbId ?? ""} />
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}

function VacationRequestRow({
  tenant,
  request,
}: {
  tenant: string;
  request: VacationRequest;
}) {
  const isPending = request.status === "pending";

  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-border-soft px-6 py-3.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">
        {request.initials}
      </div>

      <div className="min-w-[130px] flex-1">
        <div className="text-[13.5px] font-semibold text-ink">
          {request.name}
        </div>
        <div className="mt-0.5 text-[12px] text-muted">
          {request.location} {"\u00b7"} {request.team}
        </div>
      </div>

      <div className="min-w-[132px] flex-1">
        <div className="font-mono text-[12px] text-ink">
          {request.startDate} {"\u2013"} {request.endDate}
        </div>
        <div className="mt-0.5 text-[12px] text-muted">{request.days}</div>
      </div>

      <div className="shrink-0">
        <VacationStatusBadge status={request.status} />
      </div>

      <VacationDrawerButton tenant={tenant} request={request} />

      {isPending && (
        <div className="flex shrink-0 gap-[7px]">
          <DecisionForm
            tenant={tenant}
            request={request}
            action={approveVacationRequestAction}
            className="cursor-pointer rounded-lg border-0 bg-success px-[13px] py-[7px] text-[12px] font-semibold text-white transition-colors hover:bg-[#2B6845]"
          >
            Genehmigen
          </DecisionForm>
          <DecisionForm
            tenant={tenant}
            request={request}
            action={rejectVacationRequestAction}
            className="cursor-pointer rounded-lg border border-danger/30 bg-white px-[13px] py-[7px] text-[12px] font-medium text-danger transition-colors hover:border-danger/50 hover:bg-danger/5"
          >
            Ablehnen
          </DecisionForm>
        </div>
      )}
    </div>
  );
}

export default async function VacationPage({
  params,
}: PageProps<"/u/[tenant]/urlaub">) {
  const { tenant } = await params;
  const [vacationRequests, employees] = await Promise.all([
    getVacationRequestsForTenant(tenant),
    getEmployeesForTenant(tenant),
  ]);

  if (!vacationRequests || !employees) {
    notFound();
  }

  const vacationMetrics = getVacationMetrics(vacationRequests, employees);
  const employeeOptions = employees
    .filter((employee) => employee.dbId)
    .map((employee) => ({
      id: employee.dbId ?? employee.id,
      name: employee.name,
      location: employee.location,
    }));

  return (
    <>
      <PageHeader eyebrow="Abwesenheitsverwaltung" title="Urlaub">
        <VacationRequestButton tenant={tenant} employees={employeeOptions} />
      </PageHeader>

      <section className="mb-7 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {vacationMetrics.map((metric) => (
          <VacationMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <div className="mb-5 flex w-fit gap-1 rounded-xl border border-border bg-white p-[5px]">
        {filters.map((filter, index) => (
          <button
            key={filter}
            type="button"
            className={`cursor-pointer rounded-lg px-3.5 py-[7px] text-[13px] transition-colors ${
              index === 0
                ? "bg-border-soft font-semibold text-ink"
                : "bg-transparent font-normal text-muted hover:text-ink"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-card border border-border bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 pt-5 pb-3.5">
          <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-0.4px] text-ink">
            Urlaubsantraege
          </h2>
          <span className="shrink-0 font-mono text-[11px] text-muted">
            {vacationRequests.length} Eintraege
          </span>
        </div>

        {vacationRequests.length > 0 ? (
          vacationRequests.map((request) => (
            <VacationRequestRow
              key={request.dbId ?? request.id}
              tenant={tenant}
              request={request}
            />
          ))
        ) : (
          <div className="border-t border-border-soft px-6 py-10 text-[13px] text-muted">
            Noch keine Urlaubsantraege erfasst.
          </div>
        )}
      </section>

      <div className="mt-8 text-center font-mono text-[10px] tracking-[0.4px] text-[#B0B0AB]">
        Ployo {"\u00b7"} Personalakte-System {"\u00b7"} Alle Zugriffe
        protokolliert {"\u00b7"} Server in Frankfurt
      </div>
    </>
  );
}
