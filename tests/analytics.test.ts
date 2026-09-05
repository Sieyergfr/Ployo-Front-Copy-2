import { describe, expect, it } from "vitest";
import { isTrackablePath, referrerHostFrom } from "@/lib/analytics";

describe("isTrackablePath", () => {
  it("erlaubt die öffentlichen Marketing-/Rechtsseiten", () => {
    expect(isTrackablePath("/")).toBe(true);
    expect(isTrackablePath("/login")).toBe(true);
    expect(isTrackablePath("/register")).toBe(true);
    expect(isTrackablePath("/impressum")).toBe(true);
    expect(isTrackablePath("/datenschutz")).toBe(true);
    expect(isTrackablePath("/agb")).toBe(true);
    expect(isTrackablePath("/kontakt")).toBe(true);
  });

  it("lehnt Dashboard-/API-/Auth-Flow-Pfade ab", () => {
    expect(isTrackablePath("/u/acme")).toBe(false);
    expect(isTrackablePath("/api/tenants")).toBe(false);
    expect(isTrackablePath("/konto")).toBe(false);
    expect(isTrackablePath("/invite/abc123")).toBe(false);
    expect(isTrackablePath("/loginhelper")).toBe(false);
  });
});

describe("referrerHostFrom", () => {
  it("extrahiert nur den Hostnamen, nie Pfad/Query", () => {
    expect(referrerHostFrom("https://www.google.com/search?q=ployo")).toBe("www.google.com");
  });

  it("liefert einen leeren String bei fehlendem/ungültigem Referrer", () => {
    expect(referrerHostFrom(null)).toBe("");
    expect(referrerHostFrom("nicht-valide")).toBe("");
  });
});
