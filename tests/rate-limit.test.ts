import { describe, expect, it } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

function uniqueKey(name: string) {
  return `${name}-${Math.random().toString(36).slice(2)}`;
}

describe("checkRateLimit", () => {
  it("erlaubt Anfragen bis zum Limit", () => {
    const key = uniqueKey("allow");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(checkRateLimit({ key, limit: 3, windowSeconds: 60 }).allowed).toBe(
        true,
      );
    }
  });

  it("blockiert ab der ersten Anfrage über dem Limit", () => {
    const key = uniqueKey("block");

    checkRateLimit({ key, limit: 2, windowSeconds: 60 });
    checkRateLimit({ key, limit: 2, windowSeconds: 60 });

    const blocked = checkRateLimit({ key, limit: 2, windowSeconds: 60 });

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("zählt verschiedene Schlüssel getrennt", () => {
    const first = uniqueKey("a");
    const second = uniqueKey("b");

    checkRateLimit({ key: first, limit: 1, windowSeconds: 60 });

    expect(
      checkRateLimit({ key: second, limit: 1, windowSeconds: 60 }).allowed,
    ).toBe(true);
  });

  it("setzt nach Ablauf des Fensters zurück", async () => {
    const key = uniqueKey("reset");

    expect(checkRateLimit({ key, limit: 1, windowSeconds: 1 }).allowed).toBe(true);
    expect(checkRateLimit({ key, limit: 1, windowSeconds: 1 }).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(checkRateLimit({ key, limit: 1, windowSeconds: 1 }).allowed).toBe(true);
  });
});
