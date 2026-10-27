"use server";

import { type ActionState, withActionErrorHandling } from "@/lib/action-state";
import {
  addReportRecipient,
  exportHoursReport,
  isReportFormat,
  parseReportFiltersFromQuery,
  removeReportRecipient,
  sendHoursReport,
} from "@/lib/reports-service";
import { revalidatePath } from "next/cache";

type ExportPayload = {
  tenant: string;
  query: string;
  format: string;
  overrides: unknown;
};

export async function exportHoursReportAction(
  input: ExportPayload,
): Promise<ActionState & { file?: { filename: string; contentType: string; base64: string } }> {
  let file: { filename: string; contentType: string; base64: string } | undefined;

  const state = await withActionErrorHandling(async () => {
    file = await exportHoursReport({
      tenantSlug: String(input.tenant),
      filters: parseReportFiltersFromQuery(input.query),
      overrides: input.overrides,
      format: isReportFormat(input.format) ? input.format : "xlsx",
    });
  }, "Stundenreport exportieren");

  return { ...state, file };
}

export async function sendHoursReportAction(
  input: ExportPayload & { recipients: string[]; newEmail: string; saveNewEmail: boolean },
): Promise<ActionState & { sent?: number }> {
  let sent: number | undefined;

  const state = await withActionErrorHandling(async () => {
    const tenant = String(input.tenant);
    const result = await sendHoursReport({
      tenantSlug: tenant,
      filters: parseReportFiltersFromQuery(input.query),
      overrides: input.overrides,
      format: isReportFormat(input.format) ? input.format : "xlsx",
      recipients: Array.isArray(input.recipients) ? input.recipients.map(String).slice(0, 50) : [],
      newEmail: typeof input.newEmail === "string" ? input.newEmail : "",
      saveNewEmail: input.saveNewEmail === true,
    });
    sent = result.sent;
    revalidatePath(`/u/${tenant}/reports`);
  }, "Stundenreport versenden");

  return { ...state, sent };
}

export async function addReportRecipientAction(input: { tenant: string; email: string }): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    await addReportRecipient({ tenantSlug: String(input.tenant), email: String(input.email ?? "") });
    revalidatePath(`/u/${input.tenant}/reports`);
    return { success: true };
  }, "Report-Empfänger hinzufügen");
}

export async function removeReportRecipientAction(input: { tenant: string; email: string }): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    await removeReportRecipient({ tenantSlug: String(input.tenant), email: String(input.email ?? "") });
    revalidatePath(`/u/${input.tenant}/reports`);
    return { success: true };
  }, "Report-Empfänger entfernen");
}
