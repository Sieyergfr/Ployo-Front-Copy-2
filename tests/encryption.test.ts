import { describe, expect, it } from "vitest";
import { DECRYPTION_FAILED_SENTINEL, decryptField, encryptField } from "@/lib/encryption";

describe("encryptField / decryptField", () => {
  it("verschlüsselt und entschlüsselt einen Wert verlustfrei", () => {
    const plaintext = "DE89370400440532013000";
    const encrypted = encryptField(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.startsWith("enc:v1:")).toBe(true);
    expect(decryptField(encrypted)).toBe(plaintext);
  });

  it("liefert für leere Werte weiterhin einen leeren String", () => {
    expect(encryptField("")).toBe("");
    expect(decryptField("")).toBe("");
  });

  it("erzeugt bei jedem Aufruf einen anderen Ciphertext (zufälliger IV)", () => {
    const a = encryptField("gleicher-wert");
    const b = encryptField("gleicher-wert");

    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe("gleicher-wert");
    expect(decryptField(b)).toBe("gleicher-wert");
  });

  it("gibt unverschlüsselte Alt-Werte unverändert zurück (Abwärtskompatibilität)", () => {
    expect(decryptField("DE89370400440532013000")).toBe(
      "DE89370400440532013000",
    );
  });

  it("wirft für eine referenzierte Key-Version ohne konfigurierten Schlüssel (statt still zu leeren)", () => {
    expect(() => decryptField("enc:v99:AAAA")).toThrow(
      /Kein Schlüssel für Verschlüsselungs-Version 99/,
    );
  });

  it("gibt bei beschädigter Nutzlast unter einer gültigen Version einen sichtbaren Fehler-Platzhalter zurück, nicht mehr still '' (Audit-Finding M12)", () => {
    // '' wäre von echtem leerem Nutzereingang nicht zu unterscheiden — ein
    // Formular, das diesen Wert unbemerkt zurückspeichert, würde die
    // eigentlich noch vorhandenen (nur gerade nicht lesbaren) Originaldaten
    // sonst dauerhaft überschreiben.
    expect(decryptField("enc:v1:nicht-valides-base64-oder-zu-kurz")).toBe(
      DECRYPTION_FAILED_SENTINEL,
    );
  });

  it("R08 — weigert sich, den Entschlüsselungs-Platzhalter erneut zu verschlüsseln (kein stiller Datenverlust bei einem unabhängigen Speichern)", () => {
    // Typisches Aufrufmuster: `encryptField(input.feld?.trim() ?? currentEmployee.feld)`
    // — war `currentEmployee.feld` bereits der sichtbare Platzhalter (weil
    // die Entschlüsselung zuvor fehlschlug), darf ein völlig unabhängiges
    // Speichern (z. B. nur die Telefonnummer ändern) diesen Platzhalter
    // nicht klaglos verschlüsseln und damit die ursprüngliche, noch
    // vorhandene Nutzlast endgültig überschreiben (Audit-Finding M12).
    expect(() => encryptField(DECRYPTION_FAILED_SENTINEL)).toThrow(
      /REENCRYPT_DECRYPTION_FAILED_SENTINEL/,
    );
  });
});
