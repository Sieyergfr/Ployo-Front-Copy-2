import MyShiftsCard from "@/components/MyShiftsCard";
import TimeClockCard from "@/components/TimeClockCard";
import PageHeader from "@/components/PageHeader";
import SelfServiceEmployeeLink, {
  UnlinkOwnEmployeeButton,
} from "@/components/SelfServiceEmployeeLink";
import {
  MyProfileCompletionCard,
  MySicknessReportForm,
  MyVacationRequestForm,
} from "@/components/SelfServiceForms";
import { getUnlinkedEmployeesForTenant } from "@/lib/employee-service";
import { getMySelfServiceOverview } from "@/lib/self-service";
import { getMyShiftsForCurrentWeek } from "@/lib/shift-service";
import { getMyClockStatus } from "@/lib/time-tracking-service";
import { withAccessRedirect } from "@/lib/tenant-access";
import { getVacationStatusConfig } from "@/lib/vacations";
import {
  CalendarDays,
  FileText,
  Mail,
  ThermometerSnowflake,
} from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Mein Bereich",
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-");

  return year && month && day ? `${day}.${month}.${year}` : value;
}

export default async function SelfServicePage({
  params,
}: PageProps<"/u/[tenant]/mein-bereich">) {
  const t = await getTranslations("SelfServicePage");
  const tStatus = await getTranslations("VacationStatus");
  const tForms = await getTranslations("SelfServiceForms");
  const { tenant } = await params;
  const overview = await withAccessRedirect(tenant, () => getMySelfServiceOverview(tenant, tForms));

  if (!overview.employee) {
    const unlinkedEmployees = await getUnlinkedEmployeesForTenant(tenant).catch(() => []);

    return (
      <>
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
        <section className="rounded-card border border-border bg-white px-6 py-10 text-center">
          <Mail className="mx-auto mb-3 text-muted" size={28} />
          <p className="text-[15px] font-semibold text-ink">
            {t("notLinkedMessage")}
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-muted">
            {t("notLinkedHint")}
          </p>
          <SelfServiceEmployeeLink tenant={tenant} unlinkedEmployees={unlinkedEmployees} />
        </section>
      </>
    );
  }

  const { employee, vacationRequests, sicknessReports, documents, profileFields, profileCompleteness } =
    overview;
  const [myShifts, clockStatus] = await Promise.all([
    getMyShiftsForCurrentWeek(tenant).catch(() => null),
    getMyClockStatus(tenant).catch(() => null),
  ]);
  const vacationStatusConfig = getVacationStatusConfig(tStatus);

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={employee.name}
        subtitle={t("subtitle", { role: employee.role, location: employee.location || t("noLocation") })}
      >
        <UnlinkOwnEmployeeButton tenant={tenant} employeeName={employee.name} />
      </PageHeader>

      {profileFields && profileCompleteness && (
        <div className="mb-7">
          <MyProfileCompletionCard
            tenant={tenant}
            profileFields={profileFields}
            completeness={profileCompleteness}
          />
        </div>
      )}

      <section className="mb-7 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        <div className="rounded-card border border-border bg-white px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.6px] text-muted">
            {t("vacationRemainingLabel")}
          </div>
          <div className="mt-1.5 text-[22px] font-semibold text-ink">
            {t("daysCount", { count: employee.vacationRemaining })}
          </div>
        </div>
        <div className="rounded-card border border-border bg-white px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.6px] text-muted">
            {t("vacationTakenLabel")}
          </div>
          <div className="mt-1.5 text-[22px] font-semibold text-ink">
            {t("daysCount", { count: employee.vacationTaken })}
          </div>
        </div>
        <div className="rounded-card border border-border bg-white px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.6px] text-muted">
            {t("teamLabel")}
          </div>
          <div className="mt-1.5 text-[22px] font-semibold text-ink">
            {employee.team || "—"}
          </div>
        </div>
      </section>

      {/* Im Modus "nur rund um Schichten" verschwindet die Uhr hier ganz, solange
          keine Schicht in Reichweite ist — unter "Meine Zeiten" bleibt sie mit Hinweis sichtbar. */}
      {clockStatus?.showClock && (
        <div className="mb-7">
          <TimeClockCard tenant={tenant} initialStatus={clockStatus} />
        </div>
      )}

      {myShifts && (
        <div className="mb-7">
          <MyShiftsCard label={myShifts.label} range={myShifts.range} days={myShifts.days} />
        </div>
      )}

      <div className="mb-7 grid gap-5 lg:grid-cols-2">
        <section className="rounded-card border border-border bg-white px-6 py-[22px]">
          <h2 className="mb-3.5 flex items-center gap-2 font-display text-[16px] font-semibold tracking-[-0.3px] text-ink">
            <CalendarDays size={17} />
            {t("requestVacationTitle")}
          </h2>
          <MyVacationRequestForm tenant={tenant} />
        </section>

        <section className="rounded-card border border-border bg-white px-6 py-[22px]">
          <h2 className="mb-3.5 flex items-center gap-2 font-display text-[16px] font-semibold tracking-[-0.3px] text-ink">
            <ThermometerSnowflake size={17} />
            {t("sicknessTitle")}
          </h2>
          <MySicknessReportForm tenant={tenant} />
        </section>
      </div>

      <div className="mb-7 grid gap-5 lg:grid-cols-2">
        <section className="rounded-card border border-border bg-white px-6 py-[22px]">
          <h2 className="mb-3.5 font-display text-[16px] font-semibold tracking-[-0.3px] text-ink">
            {t("myVacationRequestsTitle")}
          </h2>
          {vacationRequests.length === 0 && (
            <p className="text-[12.5px] text-muted">{t("noVacationRequestsYet")}</p>
          )}
          <div className="grid gap-2">
            {vacationRequests.map((request) => {
              const status = vacationStatusConfig[request.status as keyof typeof vacationStatusConfig];

              return (
                <div
                  key={request.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border-soft px-3 py-2.5"
                >
                  <div className="text-[13px] text-ink">
                    {formatDate(request.startDate)} – {formatDate(request.endDate)}
                    <span className="ml-2 font-mono text-[11px] text-muted">
                      {t("daysCount", { count: request.days })}
                    </span>
                  </div>
                  <span
                    className={`rounded-[7px] px-2 py-[3px] font-mono text-[10px] ${status?.className ?? ""}`}
                  >
                    {status?.label ?? request.status}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-card border border-border bg-white px-6 py-[22px]">
          <h2 className="mb-3.5 font-display text-[16px] font-semibold tracking-[-0.3px] text-ink">
            {t("mySicknessReportsTitle")}
          </h2>
          {sicknessReports.length === 0 && (
            <p className="text-[12.5px] text-muted">{t("noSicknessReportsYet")}</p>
          )}
          <div className="grid gap-2">
            {sicknessReports.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border-soft px-3 py-2.5"
              >
                <div className="text-[13px] text-ink">
                  {formatDate(report.startDate)}
                  {report.endDate ? ` – ${formatDate(report.endDate)}` : t("openSuffix")}
                </div>
                <span className="rounded-[7px] bg-border-soft px-2 py-[3px] font-mono text-[10px] text-muted-2">
                  {report.status === "closed" ? t("closedStatus") : t("activeStatus")}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-card border border-border bg-white px-6 py-[22px]">
        <h2 className="mb-3.5 flex items-center gap-2 font-display text-[16px] font-semibold tracking-[-0.3px] text-ink">
          <FileText size={17} />
          {t("myDocumentsTitle")}
        </h2>
        {documents.length === 0 && (
          <p className="text-[12.5px] text-muted">
            {t("noDocumentsYet")}
          </p>
        )}
        <div className="grid gap-2">
          {documents.map((document) => (
            <div
              key={document.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border-soft px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-ink">
                  {document.name}
                </div>
                <div className="mt-0.5 font-mono text-[10.5px] text-muted">
                  {document.documentType}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] text-muted-2">
          {t.rich("accessDocsHint", {
            link: (chunks) => (
              <Link href={`/u/${tenant}/dateien`} className="underline underline-offset-2">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </section>
    </>
  );
}
