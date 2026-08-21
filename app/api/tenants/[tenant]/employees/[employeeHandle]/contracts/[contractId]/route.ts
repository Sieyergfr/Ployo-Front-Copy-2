import { auth } from "@/lib/auth";
import {
  contractStatuses,
  updateEmployeeContractStatus,
  type ContractStatus,
} from "@/lib/contract-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

function isContractStatus(value: string): value is ContractStatus {
  return (contractStatuses as readonly string[]).includes(value);
}

/** Vertragsstatus ändern (z. B. aktivieren/kündigen). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string; employeeHandle: string; contractId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, employeeHandle, contractId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-employee-contract-status:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    status?: string;
    terminationDate?: string;
    terminationReason?: string;
  } | null;

  const rawStatus = body?.status ?? "";

  if (!isContractStatus(rawStatus)) {
    return Response.json(
      { error: `Ungültiger Status. Erlaubt: ${contractStatuses.join(", ")}.` },
      { status: 400 },
    );
  }

  // Validierung wie im Dashboard (updateEmployeeContractStatusAction) — die
  // Service-Funktion selbst erzwingt das nicht.
  if (rawStatus === "terminated") {
    if (!body?.terminationDate?.trim()) {
      return Response.json(
        { error: "Bitte ein Kündigungsdatum auswählen." },
        { status: 400 },
      );
    }

    if (!body?.terminationReason?.trim()) {
      return Response.json(
        { error: "Bitte einen Kündigungsgrund angeben." },
        { status: 400 },
      );
    }
  }

  try {
    const contract = await updateEmployeeContractStatus({
      tenantSlug: tenant,
      employeeId: employeeHandle,
      contractId,
      status: rawStatus,
      terminationDate: body?.terminationDate,
      terminationReason: body?.terminationReason,
    });

    return Response.json({ contract });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
