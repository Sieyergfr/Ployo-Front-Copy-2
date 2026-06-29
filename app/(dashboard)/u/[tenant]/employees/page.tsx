import DataTable, {
  DataTableAvatar,
  DataTableBadge,
  DataTableStack,
  DataTableStatus,
  type DataTableColumn,
} from "@/components/DataTable";
import InviteEmployeeButton from "@/components/InviteEmployeeButton";
import PageHeader from "@/components/PageHeader";
import SearchInput from "@/components/inputs/SearchInput";
import {
  employeeStatusConfig,
  employees,
  type Employee,
} from "@/lib/employees";
import { ChevronDown } from "lucide-react";

const columns: Array<DataTableColumn<Employee>> = [
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
];

export default async function EmployeesPage({
  params,
}: PageProps<"/u/[tenant]/employees">) {
  const { tenant } = await params;

  return (
    <>
      <PageHeader
        eyebrow="Personalverzeichnis"
        title="Mitarbeiter"
        subtitle={`${employees.length} Eintr\u00e4ge \u00b7 alle Standorte`}
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
            <option value={"M\u00fcnchen"}>{"M\u00fcnchen"}</option>
            <option value="Berlin">Berlin</option>
            <option value="Hamburg">Hamburg</option>
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted"
          />
        </div>

        <InviteEmployeeButton />
      </PageHeader>

      <DataTable
        columns={columns}
        rows={employees}
        getRowKey={(employee) => employee.id}
        getRowHref={(employee) => `/u/${tenant}/employees/${employee.id}`}
      />
    </>
  );
}
