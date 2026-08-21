import { auth } from "@/lib/auth";
import { getPayrollStatements, uploadPayrollStatement } from "@/lib/payroll-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);

  return typeof value === "string" ? value : fallback;
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
    key: `tenant-employee-payroll-list:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const statements = await getPayrollStatements(tenant, employeeHandle);

    return Response.json({ statements });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Gehaltsabrechnung hochladen (PDF-Pflicht). `multipart/form-data`. */
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
    key: `tenant-employee-payroll:${session.user.id}`,
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

  const period = formString(formData, "period").trim();
  const file = formData.get("file");

  if (!period) {
    return Response.json(
      { error: 'Bitte einen Abrechnungszeitraum angeben (z. B. "Januar 2026").' },
      { status: 400 },
    );
  }

  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Gehaltsabrechnungen benötigen eine PDF-Datei." }, { status: 400 });
  }

  try {
    const statement = await uploadPayrollStatement({
      tenantSlug: tenant,
      employeeId: employeeHandle,
      file,
      period,
      gross: formString(formData, "gross"),
      net: formString(formData, "net"),
    });

    return Response.json({ statement }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
