"use server";

import { type ActionState, withActionErrorHandling } from "@/lib/action-state";
import {
  declineInvitationByToken,
  requestSubscriptionReminder,
  requestTenantAccess,
  SELF_SERVICE_REQUEST_MESSAGES,
} from "@/lib/self-service-requests";
import { revalidatePath } from "next/cache";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

/**
 * Eigene Meldungen direkt anzeigen, ohne sie der gemeinsamen API-Fehlerliste
 * der App hinzuzufügen (die würde Statuscodes der App-Routen ändern).
 */
async function run(fn: () => Promise<void>, context: string): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    try {
      await fn();
    } catch (error) {
      if (error instanceof Error && (SELF_SERVICE_REQUEST_MESSAGES as readonly string[]).includes(error.message)) {
        return { error: error.message };
      }

      throw error;
    }

    return { success: true };
  }, context);
}

export async function requestAccessAction(_state: ActionState, formData: FormData) {
  return run(async () => {
    await requestTenantAccess({ tenantSlug: formString(formData, "tenant"), path: formString(formData, "path") });
  }, "Zugriff anfragen");
}

export async function remindOwnerAction(_state: ActionState, formData: FormData) {
  return run(async () => {
    await requestSubscriptionReminder(formString(formData, "tenant"));
  }, "Inhaber:in erinnern");
}

export async function declineInvitationAction(_state: ActionState, formData: FormData) {
  return run(async () => {
    await declineInvitationByToken(formString(formData, "token"));
    revalidatePath("/select");
  }, "Einladung ablehnen");
}
