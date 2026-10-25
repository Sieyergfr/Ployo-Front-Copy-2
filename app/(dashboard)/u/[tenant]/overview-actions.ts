"use server";

import { type ActionState, withActionErrorHandling } from "@/lib/action-state";
import { setTenantVacationRequestStatus } from "@/lib/vacation-service";
import { setTenantWishFreeRequestStatus } from "@/lib/wish-free-service";
import { revalidatePath } from "next/cache";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function parseDecision(formData: FormData) {
  const decision = formString(formData, "decision");

  return decision === "approved" || decision === "rejected" ? decision : null;
}

/**
 * Genehmigen/Ablehnen aus dem "Handlungsbedarf" der Übersicht. Anders als die
 * Aktionen der Urlaubsseite ohne Weiterleitung: die Übersicht lädt nur neu.
 */
export async function decideVacationRequestAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const requestId = formString(formData, "requestId");
    const status = parseDecision(formData);

    if (!tenant || !requestId || !status) {
      throw new Error("Urlaubsantrag konnte nicht bearbeitet werden.");
    }

    await setTenantVacationRequestStatus({ tenantSlug: tenant, requestId, status });

    revalidatePath(`/u/${tenant}`);
    revalidatePath(`/u/${tenant}/urlaub`);

    return { success: true };
  }, "Urlaubsantrag entscheiden");
}

export async function decideWishFreeRequestAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const requestId = formString(formData, "requestId");
    const status = parseDecision(formData);

    if (!tenant || !requestId || !status) {
      throw new Error("Wunschfrei-Antrag konnte nicht bearbeitet werden.");
    }

    await setTenantWishFreeRequestStatus({ tenantSlug: tenant, requestId, status });

    revalidatePath(`/u/${tenant}`);
    revalidatePath(`/u/${tenant}/schichtplanung`);

    return { success: true };
  }, "Wunschfrei-Antrag entscheiden");
}
