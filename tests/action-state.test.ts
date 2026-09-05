import { describe, expect, it, vi } from "vitest";
import { withActionErrorHandling } from "@/lib/action-state";

function redirectSignal(url: string, statusCode: 307 | 308 = 307) {
  const error = new Error("NEXT_REDIRECT");
  (error as Error & { digest: string }).digest = `NEXT_REDIRECT;push;${url};${statusCode};`;
  return error;
}

describe("withActionErrorHandling", () => {
  it("gibt den Rückgabewert der Funktion unverändert durch", async () => {
    const result = await withActionErrorHandling(async () => ({ success: true }), "Test");
    expect(result).toEqual({ success: true });
  });

  it("gibt ein leeres ActionState zurück, wenn die Funktion nichts zurückgibt", async () => {
    const result = await withActionErrorHandling(async () => {}, "Test");
    expect(result).toEqual({});
  });

  it("reicht eine bekannte, kuratierte Fehlermeldung 1:1 durch", async () => {
    const result = await withActionErrorHandling(async () => {
      throw new Error("FORBIDDEN");
    }, "Test");
    expect(result).toEqual({ error: "FORBIDDEN" });
  });

  it("ersetzt eine unbekannte Fehlermeldung durch den generischen Text", async () => {
    const result = await withActionErrorHandling(async () => {
      throw new Error("Datenbankverbindung auf db-prod-3.internal:5432 verloren");
    }, "Test");
    expect(result.error).toBe("Etwas ist schiefgelaufen. Bitte versuche es erneut.");
    expect(result.error).not.toContain("db-prod-3");
  });

  it("lässt ein redirect()-Signal unverändert durch, statt es als Fehler zu behandeln", async () => {
    await expect(
      withActionErrorHandling(async () => {
        throw redirectSignal("/u/acme/rollen/abc");
      }, "Test"),
    ).rejects.toMatchObject({ digest: "NEXT_REDIRECT;push;/u/acme/rollen/abc;307;" });
  });

  it("loggt den echten Fehler serverseitig, wenn die Meldung nicht bekannt ist", async () => {
    const { logger } = await import("@/lib/logger");
    const spy = vi.spyOn(logger, "error").mockImplementation(() => {});

    await withActionErrorHandling(async () => {
      throw new Error("etwas ganz Unerwartetes");
    }, "Rolle erstellen");

    expect(spy).toHaveBeenCalledWith(
      "Rolle erstellen fehlgeschlagen.",
      expect.objectContaining({ error: "etwas ganz Unerwartetes" }),
    );

    spy.mockRestore();
  });
});
