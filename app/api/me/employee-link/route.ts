import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  createAndLinkOwnTenantEmployee,
  linkOwnTenantEmployee,
  unlinkOwnTenantEmployee,
} from "@/lib/employee-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { invalidRequestResponse } from "@/lib/api/validation";
import { headers } from "next/headers";

const employeeLinkSchema = z.discriminatedUnion("mode", [
  z.object({
    tenant: z.string().trim().min(1),
    mode: z.literal("create"),
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    email: z.string().trim().min(1),
  }),
  z.object({
    tenant: z.string().trim().min(1),
    mode: z.literal("link"),
    employeeId: z.string().trim().min(1),
  }),
]);

/**
 * Verknüpfung des eingeloggten Kontos mit der eigenen Personalakte —
 * Voraussetzung für alle anderen `/api/me/*`-Routen. Zwei Modi:
 * `create` (neue Personalakte anlegen und direkt verknüpfen) oder `link`
 * (bestehende, noch nicht verknüpfte Personalakte per `employeeId`
 * übernehmen).
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-employee-link:${session.user.id}`,
    limit: 10,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = await request.json().catch(() => null);
  const parsed = employeeLinkSchema.safeParse(body);

  if (!parsed.success) {
    return invalidRequestResponse(parsed.error);
  }

  try {
    if (parsed.data.mode === "create") {
      const { tenant, firstName, lastName, email } = parsed.data;
      const employee = await createAndLinkOwnTenantEmployee({
        tenantSlug: tenant,
        firstName,
        lastName,
        email,
      });

      return Response.json({ employee }, { status: 201 });
    }

    const { tenant, employeeId } = parsed.data;
    await linkOwnTenantEmployee({ tenantSlug: tenant, employeeId });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

export async function DELETE(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const tenant = new URL(request.url).searchParams.get("tenant")?.trim();

  if (!tenant) {
    return Response.json({ error: "Parameter 'tenant' fehlt." }, { status: 400 });
  }

  const limit = await checkRateLimit({
    key: `me-employee-link:${session.user.id}`,
    limit: 10,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    await unlinkOwnTenantEmployee(tenant);

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
