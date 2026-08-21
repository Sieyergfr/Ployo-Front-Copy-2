import { auth } from "@/lib/auth";
import {
  createAndLinkOwnTenantEmployee,
  linkOwnTenantEmployee,
  unlinkOwnTenantEmployee,
} from "@/lib/employee-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

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

  const body = (await request.json().catch(() => null)) as
    | {
        tenant?: string;
        mode?: "create" | "link";
        firstName?: string;
        lastName?: string;
        email?: string;
        employeeId?: string;
      }
    | null;

  if (!body?.tenant || !body.mode) {
    return Response.json({ error: "'tenant' und 'mode' sind erforderlich." }, { status: 400 });
  }

  try {
    if (body.mode === "create") {
      if (!body.firstName || !body.lastName || !body.email) {
        return Response.json(
          { error: "'firstName', 'lastName' und 'email' sind für mode=create erforderlich." },
          { status: 400 },
        );
      }

      const employee = await createAndLinkOwnTenantEmployee({
        tenantSlug: body.tenant,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
      });

      return Response.json({ employee }, { status: 201 });
    }

    if (body.mode === "link") {
      if (!body.employeeId) {
        return Response.json(
          { error: "'employeeId' ist für mode=link erforderlich." },
          { status: 400 },
        );
      }

      await linkOwnTenantEmployee({ tenantSlug: body.tenant, employeeId: body.employeeId });

      return Response.json({ status: true });
    }

    return Response.json({ error: "Ungültiger 'mode'." }, { status: 400 });
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
