"use server";

import { isKnownSelfServiceErrorMessage } from "@/lib/api/self-service-errors";
import { logger } from "@/lib/logger";
import { isClockAction } from "@/lib/time-tracking";
import { performMyClockAction, type ClockStatusView } from "@/lib/time-tracking-service";
import { revalidatePath } from "next/cache";

/**
 * Stempelaktion aus dem Web (Stempeluhr in "Mein Bereich"/"Meine Zeiten").
 * Kein Formular-Action-Muster: die Uhr ruft das direkt per Klick auf und
 * bekommt den neuen Status zurück, um ohne Neuladen umzuschalten.
 */
export async function clockAction(
  tenant: string,
  action: string,
): Promise<{ status?: ClockStatusView; error?: string }> {
  if (!tenant || !isClockAction(action)) {
    return { error: "Ungültige Stempelaktion." };
  }

  try {
    const status = await performMyClockAction({ tenantSlug: tenant, action, source: "web" });

    revalidatePath(`/u/${tenant}/zeiten`);
    revalidatePath(`/u/${tenant}/mein-bereich`);

    return { status };
  } catch (error) {
    if (isKnownSelfServiceErrorMessage(error)) {
      return { error: error.message };
    }

    logger.error("Stempelaktion fehlgeschlagen.", {
      error: error instanceof Error ? error.message : String(error),
    });

    return { error: "Etwas ist schiefgelaufen. Bitte versuche es erneut." };
  }
}
