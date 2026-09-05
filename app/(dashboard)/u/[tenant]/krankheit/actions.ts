"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  closeTenantSicknessReport,
  createTenantSicknessReport,
  updateTenantSicknessReport,
} from "@/lib/sickness";
import { type ActionState, withActionErrorHandling } from "@/lib/action-state";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createSicknessReportAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeId = formString(formData, "employeeId");
    const startDate = formString(formData, "startDate");

    if (!tenant || !employeeId || !startDate) {
      throw new Error("Bitte Mitarbeiter und Beginn der Krankmeldung angeben.");
    }

    await createTenantSicknessReport({
      tenantSlug: tenant,
      employeeId,
      startDate,
      endDate: formString(formData, "endDate") || undefined,
      certificateStatus: formString(formData, "certificateStatus"),
      reportChannel: formString(formData, "reportChannel"),
      note: formString(formData, "note"),
    });
    revalidatePath(`/u/${tenant}`);
    revalidatePath(`/u/${tenant}/krankheit`);
    redirect(`/u/${tenant}/krankheit`);
  }, "Krankmeldung erstellen");
}

export async function updateSicknessReportAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const reportId = formString(formData, "reportId");
    const startDate = formString(formData, "startDate");

    if (!tenant || !reportId || !startDate) {
      throw new Error("Krankmeldung konnte nicht aktualisiert werden.");
    }

    await updateTenantSicknessReport({
      tenantSlug: tenant,
      reportId,
      startDate,
      endDate: formString(formData, "endDate") || undefined,
      certificateStatus: formString(formData, "certificateStatus"),
      note: formString(formData, "note"),
    });
    revalidatePath(`/u/${tenant}`);
    revalidatePath(`/u/${tenant}/krankheit`);
    redirect(`/u/${tenant}/krankheit`);
  }, "Krankmeldung speichern");
}

export async function closeSicknessReportAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const reportId = formString(formData, "reportId");

    if (!tenant || !reportId) {
      throw new Error("Krankmeldung konnte nicht abgeschlossen werden.");
    }

    await closeTenantSicknessReport({
      tenantSlug: tenant,
      reportId,
      endDate: formString(formData, "endDate") || undefined,
    });
    revalidatePath(`/u/${tenant}`);
    revalidatePath(`/u/${tenant}/krankheit`);
    redirect(`/u/${tenant}/krankheit`);
  }, "Krankmeldung abschließen");
}
