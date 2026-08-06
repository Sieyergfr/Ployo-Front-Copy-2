import "server-only";

/**
 * Schlankes In-Memory-Rate-Limit für die eigenen API-Routen.
 * better-auth deckt nur die Auth-Endpunkte ab.
 *
 * Bewusst prozesslokal: schützt eine Instanz vor Dauerabfragen, ersetzt aber
 * kein verteiltes Limit. Bei mehreren Instanzen zusätzlich am Reverse Proxy
 * begrenzen.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function checkRateLimit(input: {
  key: string;
  limit: number;
  windowSeconds: number;
}): RateLimitResult {
  const now = Date.now();
  const windowMs = input.windowSeconds * 1000;

  if (buckets.size > MAX_BUCKETS) {
    sweep(now);
  }

  const existing = buckets.get(input.key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(input.key, { count: 1, resetAt: now + windowMs });

    return {
      allowed: true,
      remaining: input.limit - 1,
      retryAfterSeconds: input.windowSeconds,
    };
  }

  existing.count += 1;

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((existing.resetAt - now) / 1000),
  );

  return {
    allowed: existing.count <= input.limit,
    remaining: Math.max(0, input.limit - existing.count),
    retryAfterSeconds,
  };
}

/** Antwort für ein überschrittenes Limit inkl. Retry-After-Header. */
export function tooManyRequests(result: RateLimitResult) {
  return Response.json(
    { error: "RATE_LIMITED" },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds) },
    },
  );
}
