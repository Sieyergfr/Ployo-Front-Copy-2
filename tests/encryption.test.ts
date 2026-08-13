import { describe, expect, it } from "vitest";
import { decryptField, encryptField } from "@/lib/encryption";

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
});
