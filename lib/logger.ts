import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";

/**
 * Strukturiertes Logging für serverseitigen Code, der außerhalb des
 * normalen React-Request-Zyklus läuft (Cron-Jobs, Webhooks, Hintergrund-
 * Mailversand) — dort greift Next.js' eingebaute error.digest-Korrelation
 * nicht. In Produktion eine JSON-Zeile pro Log, in Entwicklung lesbar
 * formatiert. `runWithRequestId` hängt eine Request-ID an alle Logs
 * innerhalb des Callbacks, damit ein Vorfall über mehrere Log-Zeilen
 * hinweg nachvollziehbar bleibt.
 */

type LogMeta = Record<string, unknown>;

const requestContext = new AsyncLocalStorage<{ requestId: string }>();

// Ohne unterschriebenen AVV mit Sentry dürfen personenbezogene Daten aus
// `meta` nicht an den Drittanbieter gehen. Lokale Logs (JSON/stdout) behalten
// den vollen Wert, an Sentry geht nur eine redigierte Kopie.
const SENTRY_REDACTED_KEYS = new Set(["to", "email", "customerId"]);

function redactForSentry(meta?: LogMeta): LogMeta | undefined {
  if (!meta) return meta;
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [
      key,
      SENTRY_REDACTED_KEYS.has(key) ? "[redacted]" : value,
    ]),
  );
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function write(level: "info" | "warn" | "error", message: string, meta?: LogMeta) {
  const requestId = requestContext.getStore()?.requestId;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(requestId ? { requestId } : {}),
    ...meta,
  };

  const target = level === "error" ? console.error : level === "warn" ? console.warn : console.log;

  if (level === "error" || level === "warn") {
    Sentry.captureMessage(message, {
      level: level === "error" ? "error" : "warning",
      extra: { requestId, ...redactForSentry(meta) },
    });
  }

  if (isProduction()) {
    target(JSON.stringify(entry));
    return;
  }

  const { timestamp, level: entryLevel, message: entryMessage, ...rest } = entry;
  const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";

  target(`[${timestamp}] ${entryLevel.toUpperCase()} ${entryMessage}${extra}`);
}

export const logger = {
  info: (message: string, meta?: LogMeta) => write("info", message, meta),
  warn: (message: string, meta?: LogMeta) => write("warn", message, meta),
  error: (message: string, meta?: LogMeta) => write("error", message, meta),
};

/** Führt `fn` mit einer Request-ID im Log-Kontext aus (siehe `logger`). */
export function runWithRequestId<T>(
  fn: (requestId: string) => T,
  requestId: string = randomUUID(),
): T {
  return requestContext.run({ requestId }, () => fn(requestId));
}
