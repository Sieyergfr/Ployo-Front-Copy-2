import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { getInfoRequestDraft, saveInfoRequestDraft, deleteInfoRequestDraft } from "@/lib/info-request-drafts";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

type Context = { params: Promise<{ tenant: string; employeeHandle: string }> };
async function handle(request: Request, context: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  const limit = await checkRateLimit({ key: `info-request-draft:${session.user.id}`, limit: 120, windowSeconds: 60 });
  if (!limit.allowed) return tooManyRequests(limit);
  const { tenant, employeeHandle } = await context.params;
  try {
    if (request.method === "GET") return Response.json({ draft: await getInfoRequestDraft(tenant, employeeHandle) });
    if (request.method === "DELETE") {
      await deleteInfoRequestDraft(tenant, employeeHandle);
      return Response.json({ status: true });
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Ungültiger Entwurf." }, { status: 400 });
    return Response.json({ draft: await saveInfoRequestDraft(tenant, employeeHandle, body) });
  } catch (error) { return mapSelfServiceError(error); }
}
export const GET = handle;
export const PATCH = handle;
export const DELETE = handle;
