import { requireTenantMembership } from "@/lib/tenant-access";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { waitForLiveRevision } from "@/lib/live-updates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request, context: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant } = await context.params;
    const access = await requireTenantMembership(tenant);
    const limit = await checkRateLimit({ key: `live:${access.userId}`, limit: 240, windowSeconds: 60 });
    if (!limit.allowed) return tooManyRequests(limit);
    const since = new URL(request.url).searchParams.get("since");
    if (since !== null && !/^(0|[a-f0-9]{32})$/.test(since)) {
      return Response.json({ error: "Ungültiger Änderungsstand." }, { status: 400 });
    }
    const result = await waitForLiveRevision(access.tenantId, since, request.signal);
    // Recheck membership/access before disclosing even an opaque change cursor.
    const { prisma } = await import("@/lib/prisma");
    if (!await prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: access.tenantId, userId: access.userId } }, select: { id: true } })) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return Response.json(result, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
    if (request.signal.aborted) return new Response(null, { status: 204 });
    return mapSelfServiceError(error);
  }
}
