import "server-only";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

/**
 * DB-gestütztes Rate-Limit für die eigenen API-Routen (better-auth deckt
 * nur die Auth-Endpunkte ab). Läuft über die Postgres-Tabelle
 * `AppRateLimit`, damit das Limit über mehrere Instanzen hinweg gilt statt
 * nur pro Prozess. Das Fenster wird atomar per Upsert fortgeschrieben
 * (kein Read-then-write-Race zwischen parallelen Requests).
 */

/**
 * Client-Adresse für Rate-Limit-Schlüssel unauthentifizierter Endpunkte —
 * bisher an mehreren Stellen (app/api/contact, app/api/consent) fast
 * identisch dupliziert, hier zusammengeführt, damit die sicherheitsrelevante
 * Kopfzeilen-Reihenfolge nicht auseinanderdriften kann.
 *
 * `x-real-ip` zuerst, weil nginx den Header aus `$remote_addr` setzt und ein
 * Client ihn damit nicht selbst bestimmen kann. `x-forwarded-for` entsteht
 * dagegen aus `$proxy_add_x_forwarded_for`: der Client darf den Anfang des
 * Headers vorgeben, nginx hängt die echte Adresse nur hinten an — deshalb der
 * **letzte** Eintrag und nicht der erste. Fehlen beide, bleibt ein
 * gemeinsamer Eimer übrig; das Limit greift dann global statt gar nicht.
 */
export async function getClientIp(): Promise<string> {
  const headerList = await headers();
  const realIp = headerList.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = headerList.get("x-forwarded-for")?.split(",");
  const lastHop = forwarded?.[forwarded.length - 1]?.trim();

  return lastHop || "unknown";
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export async function checkRateLimit(input: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const windowMs = input.windowSeconds * 1000;
  const initialResetAt = new Date(Date.now() + windowMs);

  const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "AppRateLimit" ("key", "count", "resetAt")
    VALUES (${input.key}, 1, ${initialResetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "AppRateLimit"."resetAt" <= NOW() THEN 1
        ELSE "AppRateLimit"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "AppRateLimit"."resetAt" <= NOW() THEN ${initialResetAt}
        ELSE "AppRateLimit"."resetAt"
      END
    RETURNING "count", "resetAt"
  `;

  const row = rows[0];
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((row.resetAt.getTime() - Date.now()) / 1000),
  );

  return {
    allowed: row.count <= input.limit,
    remaining: Math.max(0, input.limit - row.count),
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
