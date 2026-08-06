"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  closeTenantSicknessReport,
  createTenantSicknessReport,
  updateTenantSicknessReport,
} from "@/lib/sickness";

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

export async function updateSicknessReportAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const reportId = formString(formData, "reportId");
  const startDate = formString(formData, "startDate");
  if (!tenant || !reportId || !startDate) throw new Error("INVALID_SICKNESS_REPORT");

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
}

export async function closeSicknessReportAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const reportId = formString(formData, "reportId");
  if (!tenant || !reportId) throw new Error("INVALID_SICKNESS_REPORT");

  await closeTenantSicknessReport({
    tenantSlug: tenant,
    reportId,
    endDate: formString(formData, "endDate") || undefined,
  });
  revalidatePath(`/u/${tenant}`);
  revalidatePath(`/u/${tenant}/krankheit`);
  redirect(`/u/${tenant}/krankheit`);
}
