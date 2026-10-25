"use server";

import { decideTimeCorrectionRequest } from "@/lib/time-correction-service";
import { type ActionState, withActionErrorHandling } from "@/lib/action-state";
import {
  correctTimeEntry,
  createManualTimeEntry,
  deleteTimeEntry,
} from "@/lib/time-tracking-service";
import { revalidatePath } from "next/cache";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Leeres Feld = keine Pausenkorrektur (gestempelte Pausen gelten). */
function formBreakMinutes(formData: FormData): number | null {
  const raw = formString(formData, "breakMinutes");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : Number.NaN;
}

function revalidate(tenant: string) {
  revalidatePath(`/u/${tenant}/zeiterfassung`);
  revalidatePath(`/u/${tenant}/zeiten`);
}

export async function correctTimeEntryAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");

    await correctTimeEntry({
      tenantSlug: tenant,
      entryId: formString(formData, "entryId"),
      date: formString(formData, "date"),
      startTime: formString(formData, "startTime"),
      endTime: formString(formData, "endTime") || null,
      breakMinutes: formBreakMinutes(formData),
      note: formString(formData, "note"),
    });

    revalidate(tenant);
    return { success: true };
  }, "Zeiteintrag korrigieren");
}

export async function createTimeEntryAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");

    await createManualTimeEntry({
      tenantSlug: tenant,
      employeeId: formString(formData, "employeeId"),
      date: formString(formData, "date"),
      startTime: formString(formData, "startTime"),
      endTime: formString(formData, "endTime"),
      breakMinutes: formBreakMinutes(formData),
      note: formString(formData, "note"),
    });

    revalidate(tenant);
    return { success: true };
  }, "Zeiteintrag nachtragen");
}

export async function deleteTimeEntryAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");

    await deleteTimeEntry({ tenantSlug: tenant, entryId: formString(formData, "entryId") });

    revalidate(tenant);
    return { success: true };
  }, "Zeiteintrag löschen");
}

/** Korrekturantrag genehmigen/ablehnen (Tab "Korrekturen", M6). */
export async function decideTimeCorrectionAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = String(formData.get("tenant") ?? "");
    const requestId = String(formData.get("requestId") ?? "");
    const decision = formData.get("decision");

    if (!tenant || !requestId || (decision !== "approved" && decision !== "rejected")) {
      throw new Error("Korrekturantrag konnte nicht bearbeitet werden.");
    }

    await decideTimeCorrectionRequest({
      tenantSlug: tenant,
      requestId,
      decision,
      note: String(formData.get("note") ?? ""),
    });

    revalidatePath(`/u/${tenant}/zeiterfassung`);

    return { success: true };
  }, "Korrekturantrag entscheiden");
}
