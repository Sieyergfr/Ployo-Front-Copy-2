"use server";

import {
  changeAccountPassword,
  scheduleOwnAccountDeletion,
  updateAccountName,
  updateOwnPreferences,
} from "@/lib/account-service";
import { uploadOwnAvatar } from "@/lib/avatar-service";
import { type ActionState } from "@/lib/action-state";
import { revalidatePath } from "next/cache";
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
