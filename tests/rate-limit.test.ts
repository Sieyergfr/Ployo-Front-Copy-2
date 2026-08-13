import { afterAll, describe, expect, it } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

const testKeys: string[] = [];

function uniqueKey(name: string) {
  const key = `test-rate-limit:${name}-${Math.random().toString(36).slice(2)}`;
  testKeys.push(key);

  return key;
}

afterAll(async () => {
  if (testKeys.length > 0) {
    await prisma.appRateLimit.deleteMany({ where: { key: { in: testKeys } } });
  }
  await prisma.$disconnect();
});

describe("checkRateLimit", () => {
  it("erlaubt Anfragen bis zum Limit", async () => {
    const key = uniqueKey("allow");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await checkRateLimit({ key, limit: 3, windowSeconds: 60 })).allowed).toBe(
        true,
      );
    }
  });

  it("blockiert ab der ersten Anfrage über dem Limit", async () => {
    const key = uniqueKey("block");

    await checkRateLimit({ key, limit: 2, windowSeconds: 60 });
    await checkRateLimit({ key, limit: 2, windowSeconds: 60 });

    const blocked = await checkRateLimit({ key, limit: 2, windowSeconds: 60 });

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("zählt verschiedene Schlüssel getrennt", async () => {
    const first = uniqueKey("a");
    const second = uniqueKey("b");

    await checkRateLimit({ key: first, limit: 1, windowSeconds: 60 });

    expect(
      (await checkRateLimit({ key: second, limit: 1, windowSeconds: 60 })).allowed,
    ).toBe(true);
  });

  it("setzt nach Ablauf des Fensters zurück", async () => {
    const key = uniqueKey("reset");

    expect((await checkRateLimit({ key, limit: 1, windowSeconds: 1 })).allowed).toBe(
      true,
    );
    expect((await checkRateLimit({ key, limit: 1, windowSeconds: 1 })).allowed).toBe(
      false,
    );

    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect((await checkRateLimit({ key, limit: 1, windowSeconds: 1 })).allowed).toBe(
      true,
    );
  });
});
