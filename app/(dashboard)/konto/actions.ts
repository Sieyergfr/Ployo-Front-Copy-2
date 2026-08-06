"use server";

import {
  changeAccountPassword,
  deleteOwnAccount,
  updateAccountName,
} from "@/lib/account-service";
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
  await deleteOwnAccount(formString(formData, "password"));

  redirect("/login");
}
