import DataTable, {
  DataTableAvatar,
  DataTableBadge,
  DataTableStack,
  DataTableStatus,
  type DataTableColumn,
} from "@/components/DataTable";
import EmployeeQuickView from "@/components/EmployeeQuickView";
import InviteEmployeeButton from "@/components/InviteEmployeeButton";
import PageHeader from "@/components/PageHeader";
import SearchInput from "@/components/inputs/SearchInput";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { employeeStatusConfig, type Employee } from "@/lib/employees";
import { getLocationsForTenant } from "@/lib/location-service";
import { getRolesForTenant } from "@/lib/role-service";
import { getTeamsForTenant } from "@/lib/team-service";
import { ChevronDown } from "lucide-react";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Mitarbeiter",
};

function getColumns(tenant: string): Array<DataTableColumn<Employee>> {
  return [
    {
      key: "name",
      header: "Name",
      width: "2fr",
      render: (employee) => (
        <DataTableAvatar initials={employee.initials} label={employee.name} />
      ),
    },
    {
      key: "employeeNumber",
      header: "Personal-Nr.",
      width: "116px",
      className: "font-mono text-[12px] text-muted-2",
      render: (employee) => employee.employeeNumber,
    },
    {
      key: "location",
      header: "Standort",
      width: "120px",
      className: "text-[13px] text-ink",
      render: (employee) => employee.location,
    },
    {
      key: "teamRole",
      header: "Team / Rolle",
      width: "1.3fr",
      render: (employee) => (
        <DataTableStack title={employee.team} subtitle={employee.role} />
      ),
    },
    {
      key: "startDate",
      header: "Eintritt",
      width: "112px",
      className: "font-mono text-[11.5px] text-muted",
      render: (employee) => employee.startDate,
    },
    {
      key: "contract",
      header: "Vertrag",
      width: "132px",
      render: (employee) => <DataTableBadge>{employee.contract}</DataTableBadge>,
    },
    {
      key: "status",
      header: "Status",
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
}: PageProps<"/u/[tenant]/employees">) {
  const { tenant } = await params;
  const [employees, locations, teams, roles] = await Promise.all([
    getEmployeesForTenant(tenant),
    getLocationsForTenant(tenant),
    getTeamsForTenant(tenant),
    getRolesForTenant(tenant),
  ]);

  if (!employees || !locations || !teams || !roles) {
    notFound();
  }

  const columns = getColumns(tenant);
  const locationNames = locations.map((location) => location.name);
  const permissionRoleNames = roles.length > 0
    ? roles.map((role) => role.name)
    : ["Mitarbeiter"];
  const teamNames = teams.map((team) => team.name);

  return (
    <>
      <PageHeader
        eyebrow="Personalverzeichnis"
        title="Mitarbeiter"
        subtitle={`${employees.length} Eintraege \u00b7 alle Standorte`}
      >
        <SearchInput
          placeholder="Name, Personal-Nr. oder Team"
          aria-label="Mitarbeiter suchen"
          className="min-w-[230px] bg-white"
        />

        <div className="relative">
          <select
            aria-label="Standort"
            className="input min-w-40 cursor-pointer appearance-none bg-white pr-9 font-medium"
            defaultValue="Alle Standorte"
          >
            <option value="Alle Standorte">Alle Standorte</option>
            {locationNames.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted"
          />
        </div>

        <InviteEmployeeButton
          tenant={tenant}
          locations={locationNames}
          permissionRoles={permissionRoleNames}
          teams={teamNames}
        />
      </PageHeader>

      <DataTable
        columns={columns}
        rows={employees}
        getRowKey={(employee) => employee.id}
        getRowHref={(employee) => `/u/${tenant}/employees/${employee.id}`}
        minWidth={980}
      />
    </>
  );
}
