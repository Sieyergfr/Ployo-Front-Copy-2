import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import { employees, employeeStatusConfig } from "@/lib/employees";
import { files } from "@/lib/files";
import { locations } from "@/lib/locations";
import { reminders } from "@/lib/reminders";
import { shiftConflictCount, shiftDays, shiftWeekLabel } from "@/lib/shifts";
import { currentSickness, sicknessMetrics } from "@/lib/sickness";
import { vacationRequests } from "@/lib/vacations";
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck,
  Clock3,
  FileText,
  MapPin,
  Plus,
  UserPlus,
} from "lucide-react";
import Link from "next/link";

type DashboardHomeProps = {
  params: Promise<{ tenant: string }>;
};

function DashboardCard({
  title,
  meta,
  children,
  action,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="m-0 font-display text-[19px] font-semibold leading-tight text-ink">
            {title}
          </h2>
          {meta && <div className="mt-1 text-[12px] text-muted">{meta}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[7px] bg-border-soft px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-2">
      {children}
    </span>
  );
}

function AvatarBadge({ initials }: { initials: string }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">
      {initials}
    </span>
  );
}

export default async function DashboardHome({ params }: DashboardHomeProps) {
  const { tenant } = await params;
  const baseHref = `/u/${tenant}`;

  const activeEmployees = employees.filter((employee) => employee.status === "active");
  const vacationEmployees = employees.filter(
    (employee) => employee.status === "vacation",
  );
  const absentEmployees = employees.filter((employee) => employee.status === "absent");
  const pendingVacations = vacationRequests.filter(
    (request) => request.status === "pending",
  );
  const urgentReminders = reminders.filter(
    (reminder) => reminder.priority === "urgent",
  );
  const openShiftCount = shiftDays.reduce(
    (total, day) =>
      total + day.shifts.filter((shift) => !shift.assignee).length,
    0,
  );
  const activeLocations = locations.filter((location) => location.status === "active");
  const activeToday = locations.reduce(
    (total, location) => total + location.activeToday,
    0,
  );
  const employeeTotal = employees.length;
  const averageVacationRemaining = Math.round(
    employees.reduce((total, employee) => total + employee.vacationRemaining, 0) /
      employeeTotal,
  );

  const actionItems = [
    {
      title: "Urlaubsanträge prüfen",
      detail: `${pendingVacations.length} Anträge warten auf Freigabe`,
      href: `${baseHref}/urlaub`,
      tone: "bg-warning/10 text-[#7A4E00]",
    },
    {
      title: "Schichtkonflikte lösen",
      detail: `${shiftConflictCount} Konflikte in ${shiftWeekLabel}`,
      href: `${baseHref}/schichtplanung`,
      tone: "bg-danger/10 text-danger",
    },
    {
      title: "Dringende Erinnerungen",
      detail: `${urgentReminders.length} Fristen laufen in weniger als 7 Tagen ab`,
      href: `${baseHref}/erinnerungen`,
      tone: "bg-ink text-white",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Freitag, 26. Juni 2026 · KW 26"
        title="Guten Morgen, Frau Brandt"
        subtitle="Die wichtigsten HR-Signale für Müller & Partner auf einen Blick."
      >
        <Link href={`${baseHref}/employees`} className="btn btn-primary">
          <UserPlus size={15} />
          Mitarbeiter einladen
        </Link>
        <Link href={`${baseHref}/schichtplanung`} className="btn btn-secondary">
          <Plus size={15} />
          Schicht planen
        </Link>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Mitarbeiter aktiv"
          value={`${activeEmployees.length}/${employeeTotal}`}
          trend="up"
          change="+2"
          caption="seit Monatsbeginn"
        />
        <MetricCard
          label="Heute im Dienst"
          value={activeToday}
          trend="neutral"
          change={`${activeLocations.length} Standorte`}
          caption="melden Aktivität"
        />
        <MetricCard
          label="Offene Freigaben"
          value={pendingVacations.length + urgentReminders.length}
          trend="up"
          change={`${pendingVacations.length} Urlaub`}
          caption={`${urgentReminders.length} dringend`}
        />
        <MetricCard
          label="Schicht-Risiken"
          value={shiftConflictCount + openShiftCount}
          trend="down"
          change={`${shiftConflictCount} Konflikte`}
          caption={`${openShiftCount} unbesetzt`}
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="flex flex-col gap-5">
          <DashboardCard
            title="Heute wichtig"
            meta="Priorisierte Aufgaben für HR und Planung"
          >
            <div className="grid gap-3">
              {actionItems.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="flex items-center gap-3 rounded-[12px] border border-border-light bg-bg p-3 no-underline transition-colors hover:border-muted"
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] ${item.tone}`}
                  >
                    <AlertCircle size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-ink">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-muted-2">
                      {item.detail}
                    </span>
                  </span>
                  <ArrowRight size={15} className="shrink-0 text-muted" />
                </Link>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Schichtlage"
            meta={shiftWeekLabel}
            action={
              <Link href={`${baseHref}/schichtplanung`} className="text-link">
                Öffnen
              </Link>
            }
          >
            <div className="grid gap-2">
              {shiftDays.map((day) => {
                const assignedCount = day.shifts.filter((shift) => shift.assignee).length;
                const emptyCount = day.shifts.filter((shift) => !shift.assignee).length;
                const hasConflict = day.shifts.some((shift) => shift.conflict);

                return (
                  <div
                    key={day.id}
                    className="grid grid-cols-[54px_1fr_auto] items-center gap-3 rounded-[10px] border border-border-light bg-bg px-3 py-2.5"
                  >
                    <div>
                      <div className="font-mono text-[11px] font-semibold text-ink">
                        {day.weekday}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted">
                        {day.date}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium text-ink">
                        {day.shifts.length === 0
                          ? "Keine Schichten geplant"
                          : `${assignedCount} besetzt · ${emptyCount} offen`}
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
                        <div
                          className={`h-full rounded-full ${
                            hasConflict || emptyCount > 0 ? "bg-warning" : "bg-success"
                          }`}
                          style={{
                            width:
                              day.shifts.length === 0
                                ? "0%"
                                : `${Math.max(18, Math.round((assignedCount / day.shifts.length) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                    {hasConflict ? (
                      <StatusPill>Konflikt</StatusPill>
                    ) : emptyCount > 0 ? (
                      <StatusPill>Offen</StatusPill>
                    ) : (
                      <StatusPill>Stabil</StatusPill>
                    )}
                  </div>
                );
              })}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Standorte"
            meta="Auslastung und offene Positionen heute"
            action={
              <Link href={`${baseHref}/standorte`} className="text-link">
                Alle Standorte
              </Link>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              {locations.slice(0, 4).map((location) => (
                <div
                  key={location.id}
                  className="rounded-[12px] border border-border-light bg-bg p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold text-ink">
                        {location.name}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted">
                        <MapPin size={12} />
                        {location.kind}
                      </div>
                    </div>
                    <StatusPill>{location.utilization}</StatusPill>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="font-display text-[18px] font-semibold text-ink">
                        {location.employeeCount}
                      </div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                        Team
                      </div>
                    </div>
                    <div>
                      <div className="font-display text-[18px] font-semibold text-ink">
                        {location.activeToday}
                      </div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                        Aktiv
                      </div>
                    </div>
                    <div>
                      <div className="font-display text-[18px] font-semibold text-danger">
                        {location.openPositions}
                      </div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                        Offen
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>

        <div className="flex flex-col gap-5">
          <DashboardCard title="Teamstatus" meta="Anwesenheit heute">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-[10px] bg-success/10 p-3">
                <div className="font-display text-[24px] font-semibold text-success">
                  {activeEmployees.length}
                </div>
                <div className="mt-1 text-[11px] text-muted-2">Im Dienst</div>
              </div>
              <div className="rounded-[10px] bg-border-soft p-3">
                <div className="font-display text-[24px] font-semibold text-ink">
                  {vacationEmployees.length}
                </div>
                <div className="mt-1 text-[11px] text-muted-2">Urlaub</div>
              </div>
              <div className="rounded-[10px] bg-danger/10 p-3">
                <div className="font-display text-[24px] font-semibold text-danger">
                  {absentEmployees.length}
                </div>
                <div className="mt-1 text-[11px] text-muted-2">Abwesend</div>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {[...vacationEmployees, ...absentEmployees].slice(0, 5).map((employee) => {
                const status = employeeStatusConfig[employee.status];

                return (
                  <Link
                    key={employee.id}
                    href={`${baseHref}/employees/${employee.id}`}
                    className="flex items-center gap-3 rounded-[10px] border border-border-light bg-bg p-2.5 no-underline transition-colors hover:border-muted"
                  >
                    <AvatarBadge initials={employee.initials} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">
                        {employee.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                        {employee.location} · {employee.team}
                      </span>
                    </span>
                    <StatusPill>{status.label}</StatusPill>
                  </Link>
                );
              })}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Abwesenheiten"
            meta={`${averageVacationRemaining} Tage Ø Resturlaub`}
            action={<CalendarCheck size={18} className="text-muted" />}
          >
            <div className="grid gap-3">
              {pendingVacations.slice(0, 4).map((request) => (
                <div
                  key={request.id}
                  className="flex items-center gap-3 rounded-[10px] border border-border-light bg-bg p-2.5"
                >
                  <AvatarBadge initials={request.initials} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-ink">
                      {request.name}
                    </div>
                    <div className="mt-0.5 truncate text-[11.5px] text-muted">
                      {request.startDate}-{request.endDate} · {request.days}
                    </div>
                  </div>
                  <StatusPill>Ausstehend</StatusPill>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Krankmeldungen"
            meta={sicknessMetrics[1]?.caption}
            action={<Clock3 size={18} className="text-muted" />}
          >
            <div className="mb-3 rounded-[10px] bg-danger/10 p-3">
              <div className="font-display text-[28px] font-semibold text-danger">
                {currentSickness.length}
              </div>
              <div className="mt-1 text-[12px] text-muted-2">
                aktuell krankgemeldet
              </div>
            </div>
            <div className="grid gap-2">
              {currentSickness.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-[10px] border border-border-light bg-bg p-2.5"
                >
                  <AvatarBadge initials={item.initials} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-ink">
                      {item.name}
                    </div>
                    <div className="mt-0.5 truncate text-[11.5px] text-muted">
                      seit {item.since} · {item.days} Tage
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Zuletzt aktualisiert"
            meta="Dokumente und Richtlinien"
            action={<FileText size={18} className="text-muted" />}
          >
            <div className="grid gap-2">
              {files.slice(0, 4).map((file) => (
                <div
                  key={file.name}
                  className="flex items-center justify-between gap-3 rounded-[10px] border border-border-light bg-bg px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-semibold text-ink">
                      {file.name}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted">
                      {file.owner} · {file.updatedAt}
                    </div>
                  </div>
                  <StatusPill>{file.type}</StatusPill>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard title="Personalstruktur" meta="Vertragsarten">
            <div className="grid gap-2">
              {["Unbefristet", "Teilzeit", "Befristet", "Werkstudentin"].map(
                (contract) => {
                  const count = employees.filter(
                    (employee) => employee.contract === contract,
                  ).length;
                  const percent = Math.round((count / employeeTotal) * 100);

                  return (
                    <div key={contract}>
                      <div className="mb-1 flex justify-between text-[12px]">
                        <span className="font-medium text-ink">{contract}</span>
                        <span className="text-muted">{count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full rounded-full bg-ink"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          </DashboardCard>
        </div>
      </div>
    </>
  );
}
