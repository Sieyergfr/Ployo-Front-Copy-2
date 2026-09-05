import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { isKnownSelfServiceErrorMessage } from "@/lib/api/self-service-errors";
import { logger } from "@/lib/logger";

/**
 * Einheitliche Rückgabeform für Server Actions, die mit `useActionState`
 * verdrahtet sind. Ersetzt geworfene Errors (→ generische Fehlerseite) durch
 * Feld- bzw. Formularfehler, die das Formular selbst anzeigen kann.
 */
export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /**
   * Für Actions, die bewusst NICHT per `redirect` enden (z. B. der
   * PIN-Dialog oder ein Drag-&-Drop-Upload): der Client erkennt daran, dass
   * er selbst schließen bzw. neu laden soll.
   */
  success?: boolean;
};

export const initialActionState: ActionState = {};

/**
 * Validiert `input` gegen ein Zod-Schema und liefert entweder die
 * geparsten Daten oder ein `ActionState` mit Feldfehlern, das eine Action
 * direkt als Rückgabewert an `useActionState` durchreichen kann.
 */
export function parseAction<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
):
  | { success: true; data: z.infer<Schema> }
  | { success: false; state: ActionState } {
  const result = schema.safeParse(input);

  if (!result.success) {
    return {
      success: false,
      state: { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> },
    };
  }

  return { success: true, data: result.data };
}

/**
 * Text für Fehler, die keine unserer eigenen, kuratierten Meldungen sind
 * (siehe `isKnownSelfServiceErrorMessage`) — bewusst dieselbe Formulierung
 * wie der Fallback in `TenantErrorBoundary`, damit "unerwarteter Fehler"
 * app-weit einheitlich klingt, egal ob er über die Error-Boundary oder
 * einen Toast ankommt.
 */
const GENERIC_ACTION_ERROR = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

/**
 * Wandelt eine Server Action, die bei einem Fehler wirft (bisheriges Muster
 * in fast allen `actions.ts`-Dateien — landet unbehandelt in der nächsten
 * Error-Boundary und reißt dabei das ganze Formular samt Eingaben weg), in
 * eine `useActionState`-taugliche Funktion um, die stattdessen ein
 * `ActionState` zurückgibt.
 *
 * - `redirect()`/`notFound()` aus `fn` laufen unverändert durch
 *   (`unstable_rethrow` erkennt ihr Kontrollfluss-Signal und wirft es
 *   weiter, statt es hier als Fehler zu behandeln) — der Erfolgsfall jeder
 *   Action bleibt also exakt wie bisher.
 * - Eine unserer eigenen, bereits kuratierten Meldungen (siehe
 *   `lib/api/self-service-errors.ts`, dieselbe Allowlist wie für
 *   `/api/*`-Routen) wird 1:1 durchgereicht — das sind bewusst verfasste,
 *   sichere Texte, keine Interna.
 * - Alles andere (ein wirklich unerwarteter Fehler) wird geloggt und als
 *   eine feste, generische Meldung zurückgegeben statt die rohe
 *   Exception-Message zu zeigen.
 */
export async function withActionErrorHandling(
  fn: () => Promise<ActionState | void>,
  context: string,
): Promise<ActionState> {
  try {
    return (await fn()) ?? {};
  } catch (error) {
    unstable_rethrow(error);

    if (isKnownSelfServiceErrorMessage(error)) {
      return { error: error.message };
    }

    logger.error(`${context} fehlgeschlagen.`, {
      error: error instanceof Error ? error.message : String(error),
    });

    return { error: GENERIC_ACTION_ERROR };
  }
}
