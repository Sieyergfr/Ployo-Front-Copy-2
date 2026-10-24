"use server";

import type { ActionState } from "@/lib/action-state";
import { withActionErrorHandling } from "@/lib/action-state";
import { disableTwoFactorRequirementAsOwner } from "@/lib/settings-service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/** Owner ohne 2FA kann die Mandanten-Pflicht hier abschalten (sonst kein Weg zurück in die Einstellungen). */
export async function disableTwoFactorRequirementAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const value = formData.get("tenant");
    const tenant = typeof value === "string" ? value.trim() : "";

    if (!tenant) {
      throw new Error("FORBIDDEN");
    }

    await disableTwoFactorRequirementAsOwner(tenant);
    revalidatePath(`/u/${tenant}`, "layout");
    redirect(`/u/${tenant}`);
  }, "2FA-Pflicht deaktivieren");
}
