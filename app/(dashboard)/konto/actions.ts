"use server";

import {
  changeAccountPassword,
  getOwnPreferences,
  scheduleOwnAccountDeletion,
  updateAccountName,
  updateOwnPreferences,
} from "@/lib/account-service";
import { uploadOwnAvatar } from "@/lib/avatar-service";
import { type ActionState } from "@/lib/action-state";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_DAYS } from "@/lib/locale-shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function updateAccountNameAction(formData: FormData) {
  await updateAccountName(formString(formData, "name"));

  revalidatePath("/konto");
  redirect("/konto?saved=name");
}

export async function changePasswordAction(formData: FormData) {
  const newPassword = formString(formData, "newPassword");

  if (newPassword !== formString(formData, "newPasswordRepeat")) {
    throw new Error("Die neuen Passwörter stimmen nicht überein.");
  }

  await changeAccountPassword({
    currentPassword: formString(formData, "currentPassword"),
    newPassword,
    revokeOtherSessions: formData.get("revokeOtherSessions") === "on",
  });

  revalidatePath("/konto");
  redirect("/konto?saved=password");
}

export async function deleteAccountAction(formData: FormData) {
  await scheduleOwnAccountDeletion(formString(formData, "password"));

  redirect("/login?accountDeletionScheduled=1");
}

export async function uploadAvatarAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Bitte ein Bild auswählen." };
  }

  try {
    await uploadOwnAvatar(file);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Upload fehlgeschlagen.",
    };
  }

  revalidatePath("/konto");

  return {};
}

/**
 * Leichtgewichtiger Sprachwechsel für den globalen Umschalter in der
 * Navigation (components/Navigation.tsx) — im Unterschied zu
 * updatePreferencesAction bleiben die übrigen Präferenzen unangetastet und
 * es wird zur aufrufenden Seite statt immer zu /konto zurückgesprungen.
 */
export async function switchLanguageAction(formData: FormData) {
  const language = formString(formData, "language");
  const redirectTo = formString(formData, "redirectTo") || "/konto";
  const current = await getOwnPreferences();

  await updateOwnPreferences({
    language,
    timezone: current.timezone,
    startPage: current.startPage,
    dateFormat: current.dateFormat,
  });

  // Damit die Wahl auch nach dem Logout (Login-/Marketing-Seiten ohne
  // Session, siehe lib/i18n.ts) erhalten bleibt statt auf "de" zurückzufallen.
  (await cookies()).set(LOCALE_COOKIE, language, {
    maxAge: LOCALE_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
  });

  revalidatePath(redirectTo);
  redirect(redirectTo);
}

export async function updatePreferencesAction(formData: FormData) {
  await updateOwnPreferences({
    language: formString(formData, "language"),
    timezone: formString(formData, "timezone"),
    startPage: formString(formData, "startPage"),
    dateFormat: formString(formData, "dateFormat"),
  });

  revalidatePath("/konto");
  redirect("/konto?saved=preferences");
}
