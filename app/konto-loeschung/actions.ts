"use server";

import { cancelOwnAccountDeletion } from "@/lib/account-service";
import {
  requestAccountDeletionByEmail,
  confirmAccountDeletionByToken,
} from "@/lib/account-service";
import { checkRateLimit } from "@/lib/rate-limit";
import { type ActionState, withActionErrorHandling } from "@/lib/action-state";
import { redirect } from "next/navigation";

export async function cancelAccountDeletionAction(): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    await cancelOwnAccountDeletion();

    redirect("/select");
  }, "Kontolöschung abbrechen");
}

/**
 * Oeffentlicher, login-loser Einstieg (Google-Play-Vorgabe). Antwortet
 * bewusst immer mit derselben Erfolgsmeldung, unabhaengig davon, ob zur
 * E-Mail ein Konto existiert - siehe requestAccountDeletionByEmail.
 */
export async function requestAccountDeletionAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "Bitte eine E-Mail-Adresse angeben." };
  }

  const limit = await checkRateLimit({
    key: `account-deletion-request:${email.toLowerCase()}`,
    limit: 3,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return { error: "Zu viele Anfragen. Bitte in einer Stunde erneut versuchen." };
  }

  try {
    await requestAccountDeletionByEmail(email);
  } catch {
    return { error: "Bitte eine gueltige E-Mail-Adresse angeben." };
  }

  return { success: true };
}

export async function confirmAccountDeletionAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = String(formData.get("token") ?? "").trim();

  if (!token) {
    return { error: "Ungueltiger Link." };
  }

  const limit = await checkRateLimit({
    key: `account-deletion-confirm:${token}`,
    limit: 10,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return { error: "Zu viele Versuche. Bitte spaeter erneut versuchen." };
  }

  try {
    await confirmAccountDeletionByToken(token);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Konto konnte nicht geloescht werden.",
    };
  }

  return { success: true };
}
