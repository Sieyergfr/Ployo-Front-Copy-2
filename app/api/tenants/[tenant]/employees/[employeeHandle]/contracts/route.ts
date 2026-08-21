import { auth } from "@/lib/auth";
import {
  contractStatuses,
  createEmployeeContract,
  getEmployeeContracts,
  type ContractStatus,
} from "@/lib/contract-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);

  return typeof value === "string" ? value : fallback;
}

function isContractStatus(value: string): value is ContractStatus {
  return (contractStatuses as readonly string[]).includes(value);
}

/** `employeeHandle` akzeptiert hier sowohl `key` als auch DB-`id` (Service-Funktion sucht per OR). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; employeeHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, employeeHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-employee-contracts:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const contracts = await getEmployeeContracts(tenant, employeeHandle);

    return Response.json({ contracts });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Neuen Vertrag hochladen (PDF-Pflicht). `multipart/form-data`. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string; employeeHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, employeeHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-employee-contracts-create:${session.user.id}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return Response.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const title = formString(formData, "title").trim();
  const startDate = formString(formData, "startDate").trim();
  const file = formData.get("file");

  if (!title || !startDate) {
    return Response.json(
      { error: "Titel, Mitarbeiter und Vertragsbeginn sind erforderlich." },
      { status: 400 },
    );
  }

  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Bitte die Vertrags-PDF auswählen." }, { status: 400 });
  }

  const rawStatus = formString(formData, "status", "draft");
  const status: ContractStatus = isContractStatus(rawStatus) ? rawStatus : "draft";
  const vacationDays = Math.max(0, Number(formString(formData, "vacationDays", "0")) || 0);

  try {
    const contract = await createEmployeeContract({
      tenantSlug: tenant,
      employeeId: employeeHandle,
      file,
      title,
      startDate,
      contractType: formString(formData, "contractType", "Arbeitsvertrag"),
      status,
      endDate: formString(formData, "endDate"),
      probationEndDate: formString(formData, "probationEndDate"),
      noticePeriod: formString(formData, "noticePeriod"),
      position: formString(formData, "position"),
      department: formString(formData, "department"),
      workLocation: formString(formData, "workLocation"),
      weeklyHours: formString(formData, "weeklyHours"),
      compensation: formString(formData, "compensation"),
      vacationDays,
      notes: formString(formData, "notes"),
    });

    return Response.json({ contract }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
