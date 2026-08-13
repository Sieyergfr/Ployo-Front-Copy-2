import "server-only";
import type { z } from "zod";

/**
 * Einheitliche Rückgabeform für Server Actions, die mit `useActionState`
 * verdrahtet sind. Ersetzt geworfene Errors (→ generische Fehlerseite) durch
 * Feld- bzw. Formularfehler, die das Formular selbst anzeigen kann.
 */
export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
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
