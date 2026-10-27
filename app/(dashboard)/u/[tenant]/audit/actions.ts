"use server";

import { type ActionState, withActionErrorHandling } from "@/lib/action-state";
import { exportTenantAuditLog } from "@/lib/audit";

export async function exportAuditLogAction(input: {
  tenant: string;
  sinceDays: number | null;
}): Promise<ActionState & { file?: { filename: string; contentType: string; base64: string } }> {
  let file: { filename: string; contentType: string; base64: string } | undefined;

  const state = await withActionErrorHandling(async () => {
    const sinceDays = typeof input.sinceDays === "number" && Number.isFinite(input.sinceDays) ? Math.max(1, Math.min(3650, input.sinceDays)) : null;

    file = await exportTenantAuditLog({ tenantSlug: String(input.tenant), sinceDays });
  }, "Audit-Log exportieren");

  return { ...state, file };
}
