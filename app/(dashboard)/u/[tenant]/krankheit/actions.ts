"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTenantSicknessReport } from "@/lib/sickness";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createSicknessReportAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const employeeId = formString(formData, "employeeId");
  const startDate = formString(formData, "startDate");
  if (!tenant || !employeeId || !startDate) throw new Error("INVALID_SICKNESS_REPORT");

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
}
