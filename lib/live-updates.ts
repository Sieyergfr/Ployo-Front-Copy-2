import { setTimeout as delay } from "node:timers/promises";
import { prisma } from "@/lib/prisma";

export async function getLiveRevision(tenantId: string): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ revision: string }>>`
    SELECT "revision" FROM "TenantLiveRevision" WHERE "tenantId" = ${tenantId}
  `;
  return rows[0]?.revision ?? "0";
}

/** Long polling works across server instances and ordinary HTTP proxies.
 * The DB trigger commits the cursor atomically with the actual domain change.
 * Only a cursor is returned; domain endpoints still enforce their own scopes.
 */
export async function waitForLiveRevision(tenantId: string, since: string | null, signal: AbortSignal) {
  const deadline = Date.now() + 20_000;
  while (!signal.aborted) {
    const revision = await getLiveRevision(tenantId);
    if (since !== revision || Date.now() >= deadline) return { revision };
    await delay(1000, undefined, { signal });
  }
  throw new DOMException("Aborted", "AbortError");
}
