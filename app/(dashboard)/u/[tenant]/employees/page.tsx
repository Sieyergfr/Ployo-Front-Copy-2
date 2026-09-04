import DataTable, {
  DataTableAvatar,
  DataTableBadge,
  DataTableStack,
  DataTableStatus,
  type DataTableColumn,
} from "@/components/DataTable";
import EmployeeQuickView from "@/components/EmployeeQuickView";
import FolderTemplateButton from "@/components/FolderTemplateButton";
import InviteEmployeeButton from "@/components/InviteEmployeeButton";
import PageHeader from "@/components/PageHeader";
import PaginationControls from "@/components/PaginationControls";
import EmployeeListFilters from "@/components/EmployeeListFilters";
import {
  getEmployeesForTenant,
  getMyEmployeeHandle,
  previewNextEmployeeNumber,
} from "@/lib/employee-service";
import { employeeStatusConfig, type Employee, type EmployeeStatus } from "@/lib/employees";
import { getLocationsForTenant } from "@/lib/location-service";
import { paginate, searchParamPage, searchParamString } from "@/lib/pagination";
import { hasPermissionLevel } from "@/lib/roles";
import { getRolesForTenant } from "@/lib/role-service";
import {
  getOptionalTenantAccess,
  getTenantPermissions,
  withAccessRedirect,
} from "@/lib/tenant-access";
import { getTeamsForTenant } from "@/lib/team-service";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

const PAGE_SIZE = 25;

export const metadata = {
  title: "Mitarbeiter",
};

function getColumns(
  tenant: string,
  t: (key: string) => string,
): Array<DataTableColumn<Employee>> {
  return [
    {
      key: "name",
      header: t("columns.name"),
      width: "2fr",
      render: (employee) => (
        <DataTableAvatar initials={employee.initials} label={employee.name} />
      ),
    },
    {
      key: "employeeNumber",
      header: t("columns.employeeNumber"),
      width: "116px",
      className: "font-mono text-[12px] text-muted-2",
      render: (employee) => employee.employeeNumber,
    },
    {
      key: "location",
      header: t("columns.location"),
      width: "120px",
      className: "text-[13px] text-ink",
      render: (employee) =>
        employee.locations?.length ? employee.locations.join(", ") : employee.location,
    },
    {
      key: "teamRole",
      header: t("columns.teamRole"),
      width: "1.3fr",
      render: (employee) => (
        <DataTableStack title={employee.team} subtitle={employee.role} />
      ),
    },
    {
      key: "startDate",
      header: t("columns.startDate"),
      width: "112px",
      className: "font-mono text-[11.5px] text-muted",
      render: (employee) => employee.startDate,
    },
    {
      key: "contract",
      header: t("columns.contract"),
      width: "132px",
      render: (employee) => <DataTableBadge>{employee.contract}</DataTableBadge>,
    },
    {
      key: "status",
      header: t("columns.status"),
      width: "130px",
      render: (employee) => {
        const status = employeeStatusConfig[employee.status];

        return <DataTableStatus label={status.label} tone={status.tone} />;
      },
    },
    {
      key: "quickView",
      header: "",
      width: "56px",
      headerClassName: "text-right",
      isRowAction: true,
      render: (employee) => (
        <div className="flex justify-end">
          <EmployeeQuickView
            employee={employee}
            href={`/u/${tenant}/employees/${employee.id}`}
          />
        </div>
      ),
    },
  ];
}

export default async function EmployeesPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/employees">) {
  const { tenant } = await params;
  const query = await searchParams;

  // Bei "own"-Sichtbarkeit (z. B. einfaches Mitgliedskonto) gibt es keine
  // Mitarbeiterliste zu zeigen — direkt auf das eigene Profil weiterleiten.
  const employeesAccess = await getOptionalTenantAccess(tenant, "employees", "read");

  if (employeesAccess && employeesAccess.scope === "own") {
    const ownHandle = await getMyEmployeeHandle(tenant);

    redirect(
      ownHandle ? `/u/${tenant}/employees/${ownHandle}` : `/u/${tenant}/mein-bereich`,
    );
  }

  // Such-/Standortfilter werden serverseitig angewandt (Prisma-`where`), nicht
  // erst im Browser — die Antwort enthält damit nur noch die Treffer. Der
  // Statusfilter wirkt erst nach der Live-Berechnung (siehe getEmployeesForTenant).
  const search = searchParamString(query.search);
  const locationFilter = searchParamString(query.location);
  const rawStatusFilter = searchParamString(query.status);
  const statusFilter = (
    ["active", "vacation", "absent", "former"] as const
  ).includes(rawStatusFilter as EmployeeStatus)
    ? (rawStatusFilter as EmployeeStatus)
    : undefined;
  const isFiltered = Boolean(search || locationFilter || statusFilter);

  const employees = await withAccessRedirect(tenant, () =>
    getEmployeesForTenant(tenant, { search, location: locationFilter, status: statusFilter }),
  );

  if (!employees) {
    notFound();
  }

  // Standorte/Teams/Rollen sind hier nur Zusatzinfo für Filter und Dropdowns —
  // fehlt dafür die Berechtigung (z. B. "Rollen" ist admin-only), wird das
  // tolerant übergangen statt die ganze Mitarbeiterliste zu sperren.
  const [locations, teams, roles, employeeNumberPreview, permissions] = await Promise.all([
    getLocationsForTenant(tenant).catch(() => null).then((v) => v ?? []),
    getTeamsForTenant(tenant).catch(() => null).then((v) => v ?? []),
    getRolesForTenant(tenant).catch(() => null).then((v) => v ?? []),
    previewNextEmployeeNumber(tenant),
    getTenantPermissions(tenant),
  ]);
  const canCreateEmployee = hasPermissionLevel(permissions.employees, "write");
  const t = await getTranslations("Employees");

  const columns = getColumns(tenant, t);
  const locationNames = locations.map((location) => location.name);
  const permissionRoleNames = roles.length > 0
    ? roles.map((role) => role.name)
    : [t("defaultRoleName")];
  const teamNames = teams.map((team) => team.name);
  const page = paginate(employees, searchParamPage(query.page), PAGE_SIZE);

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("pageTitle")}
        subtitle={
          isFiltered
            ? t("subtitleFiltered", { count: employees.length })
            : t("subtitle", { count: employees.length })
        }
      >
        <EmployeeListFilters
          locations={locationNames}
          searchPlaceholder={t("searchPlaceholder")}
          searchAriaLabel={t("searchAriaLabel")}
          locationFilterLabel={t("locationFilterLabel")}
          allLocationsLabel={t("allLocations")}
          statusFilterLabel={t("statusFilterLabel")}
          allStatusesLabel={t("allStatuses")}
          statusOptions={[
            { value: "active", label: t("statusActive") },
            { value: "vacation", label: t("statusVacation") },
            { value: "absent", label: t("statusAbsent") },
            { value: "former", label: t("statusFormer") },
          ]}
        />

        {canCreateEmployee && <FolderTemplateButton tenant={tenant} />}

        {canCreateEmployee && (
          <InviteEmployeeButton
            tenant={tenant}
            locations={locationNames}
            permissionRoles={permissionRoleNames}
            teams={teamNames}
            employeeNumberPreview={employeeNumberPreview}
          />
        )}
      </PageHeader>

      <DataTable
        columns={columns}
        rows={page.items}
        getRowKey={(employee) => employee.id}
        getRowHref={(employee) => `/u/${tenant}/employees/${employee.id}`}
        minWidth={980}
        emptyState={isFiltered ? t("noResults") : t("noEmployeesYet")}
      />
      <PaginationControls
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
        pageSize={page.pageSize}
        basePath={`/u/${tenant}/employees`}
        query={{ search, location: locationFilter, status: statusFilter }}
      />
    </>
  );
}
