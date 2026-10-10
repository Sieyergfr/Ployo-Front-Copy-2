import { describe, expect, it } from "vitest";
import { clockQrPayload, generateClockQrToken, isClockQrToken, parseClockQrToken } from "@/lib/time-clock-qr";

describe("Stempel-QR-Code", () => {
  it("erzeugt zufällige, URL-taugliche Tokens", () => {
    const tokens = new Set(Array.from({ length: 50 }, generateClockQrToken));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(isClockQrToken(token)).toBe(true);
  });

  it("baut die Stempel-URL ohne doppelten Schrägstrich", () => {
    expect(clockQrPayload("a".repeat(32), "https://ployo.io/")).toBe(`https://ployo.io/stempeln/${"a".repeat(32)}`);
  });

  it("liest das Token aus URL (beliebiger Host) oder nacktem Token", () => {
    const token = generateClockQrToken();
    expect(parseClockQrToken(clockQrPayload(token, "https://ployo.io"))).toBe(token);
    expect(parseClockQrToken(`  http://localhost:3000/stempeln/${token}/  `)).toBe(token);
    expect(parseClockQrToken(`https://andere-domain.de/stempeln/${token}?utm=x`)).toBe(token);
    expect(parseClockQrToken(token)).toBe(token);
  });

  it("verwirft alles andere", () => {
    for (const value of [
      null,
      42,
      "",
      "hallo",
      "https://ployo.io/stempeln/zu-kurz",
      `https://ployo.io/stempeln/${"a".repeat(33)}`,
      `https://ployo.io/stempeln/${"a".repeat(32)}/mehr`,
      `https://ployo.io/anderes/${"a".repeat(32)}`,
      `${"a".repeat(31)}!`,
      `https://ployo.io/stempeln/${"a".repeat(32)}${" ".repeat(600)}x`,
    ]) {
      expect(parseClockQrToken(value)).toBeNull();
    }
  });
});
