"use server";

import { cancelOwnAccountDeletion } from "@/lib/account-service";
import { redirect } from "next/navigation";

export async function cancelAccountDeletionAction() {
  await cancelOwnAccountDeletion();

  redirect("/select");
}
