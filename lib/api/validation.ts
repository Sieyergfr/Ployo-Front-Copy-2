import { z, type ZodError } from "zod";

/**
 * Einheitliche 400-Antwort für fehlgeschlagene Zod-Validierung über alle
 * API-Routen hinweg. `error` trägt die erste Fehlermeldung — die Mobile-App
 * (lib/api.ts dort) zeigt genau dieses Feld direkt als Fehlertext an, ein
 * generisches "Ungültige Anfrage." würde die sorgfältig formulierten
 * Feld-Meldungen verdecken. `details` trägt den vollständigen Baum für
 * Aufrufer, die mehr als nur den ersten Fehler brauchen.
 */
export function invalidRequestResponse(error: ZodError) {
  const firstMessage = error.issues[0]?.message || "Ungültige Anfrage.";

  return Response.json(
    { error: firstMessage, details: z.treeifyError(error) },
    { status: 400 },
  );
}
