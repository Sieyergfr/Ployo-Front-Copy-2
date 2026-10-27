import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { addReportRecipient, removeReportRecipient } from "@/lib/reports-service";
import { headers } from "next/headers";

type Context = { params: Promise<{ tenant: string }> };

async function handle(request: Request, { params }: Context, action: "add" | "remove") {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;
  const limit = await checkRateLimit({ key: `tenant-report-recipients:${session.user.id}`, limit: 30, windowSeconds: 60 });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const email = typeof body?.email === "string" ? body.email : "";

  try {
    if (action === "add") {
      return Response.json({ email: await addReportRecipient({ tenantSlug: tenant, email }) }, { status: 201 });
    }

    await removeReportRecipient({ tenantSlug: tenant, email });
    return Response.json({ ok: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Gespeicherten Report-Empfänger hinzufügen (`timeTracking:write`). Body: `{ email }`. */
export function POST(request: Request, context: Context) {
  return handle(request, context, "add");
}

/** Gespeicherten Report-Empfänger entfernen (`timeTracking:write`). Body: `{ email }`. */
export function DELETE(request: Request, context: Context) {
  return handle(request, context, "remove");
}
