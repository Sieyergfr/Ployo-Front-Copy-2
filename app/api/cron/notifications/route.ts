import { prisma } from "@/lib/prisma";
import { daysUntil } from "@/lib/reminders";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { isDigestDue } from "@/lib/notifications/digest-schedule";
import { logger, runWithRequestId } from "@/lib/logger";

export const runtime = "nodejs";

// Seitengröße für die Cursor-Paginierung unten — hält den Speicherbedarf pro
// Batch (Mandanten + deren Mitgliedschaften) unabhängig von der Gesamtzahl
// der Mandanten beschränkt.
const TENANT_PAGE_SIZE = 500;

/**
 * Wöchentlicher E-Mail-Digest für fällige Erinnerungen/Fristen
 * ("deadlineAlerts"). Per externem Scheduler täglich aufrufen:
 * GET /api/cron/notifications mit Authorization: Bearer <CRON_SECRET>
 * — sendet nur an Mandanten, deren `digestTime` gerade erreicht ist.
 *
 * Urlaubs-/Krankmeldungen ("absenceAlerts") laufen NICHT über diesen Job,
 * sondern werden sofort ausgelöst (siehe lib/notifications/events.ts, wird
 * beim Stellen/Entscheiden eines Antrags aufgerufen).
 */
export async function GET(request: Request) {
  return runWithRequestId((requestId) => handleNotifications(request, requestId));
}

async function handleNotifications(request: Request, requestId: string) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    logger.error("CRON_SECRET ist nicht konfiguriert.");
    return Response.json(
      { error: "CRON_SECRET ist nicht konfiguriert." },
      { status: 503, headers: { "x-request-id": requestId } },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    logger.warn("Cron notifications: nicht autorisierter Aufruf.");
    return Response.json(
      { error: "Nicht autorisiert." },
      { status: 401, headers: { "x-request-id": requestId } },
    );
  }

  logger.info("Cron notifications gestartet.");
  const now = new Date();
  let digestsSent = 0;
  let cursor: string | undefined;

  // Seitenweise statt eines einzigen `findMany` ohne `take` (skaliert sonst
  // nicht mit wachsender Mandantenzahl) — pro Seite werden die fälligen
  // Erinnerungen ALLER darin fälligen Mandanten in einer einzigen Abfrage
  // geholt statt einer pro Mandant (vorher N+1).
  for (;;) {
    const tenants = await prisma.tenant.findMany({
      take: TENANT_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        settings: {
          select: { mailNotifications: true, deadlineAlerts: true, digestTime: true },
        },
        memberships: {
          where: { role: { in: ["OWNER", "ADMIN", "HR"] } },
          select: { userId: true, user: { select: { email: true } } },
        },
      },
    });

    if (tenants.length === 0) break;
    cursor = tenants[tenants.length - 1]!.id;

    const dueTenants = tenants.filter((tenant) => {
      const settings = tenant.settings;
      return settings?.mailNotifications && settings.deadlineAlerts && isDigestDue(settings.digestTime, now);
    });

    if (dueTenants.length > 0) {
      const reminders = await prisma.tenantReminder.findMany({
        where: { tenantId: { in: dueTenants.map((tenant) => tenant.id) }, status: "open" },
        select: { tenantId: true, title: true, dueDate: true, remindDaysBefore: true },
      });

      const remindersByTenant = new Map<string, typeof reminders>();
      for (const reminder of reminders) {
        const bucket = remindersByTenant.get(reminder.tenantId);
        if (bucket) {
          bucket.push(reminder);
        } else {
          remindersByTenant.set(reminder.tenantId, [reminder]);
        }
      }

      for (const tenant of dueTenants) {
        const urgent = (remindersByTenant.get(tenant.id) ?? [])
          // Vorlauf je Erinnerung (Standard 7 Tage wie bisher).
          .filter((reminder) => daysUntil(reminder.dueDate) <= reminder.remindDaysBefore)
          .sort((a, b) => daysUntil(a.dueDate) - daysUntil(b.dueDate))
          .slice(0, 10);

        if (urgent.length === 0 || tenant.memberships.length === 0) continue;

        await Promise.all(
          tenant.memberships.map((manager) =>
            dispatchNotification({
              userId: manager.userId,
              email: manager.user.email,
              message: {
                key: "reminderDigest",
                tenantName: tenant.name,
                reminders: urgent.map((reminder) => ({
                  title: reminder.title,
                  dueDate: reminder.dueDate,
                })),
              },
              tenantId: tenant.id,
              category: "system",
              // Sammelmeldung über mehrere Erinnerungen — Ziel ist die Liste,
              // nicht eine einzelne Zeile, deshalb ohne `entityId`.
              entityType: "reminders",
            }),
          ),
        );
        digestsSent += tenant.memberships.length;
      }
    }

    if (tenants.length < TENANT_PAGE_SIZE) break;
  }

  logger.info("Cron notifications abgeschlossen.", { digestsSent });

  return Response.json(
    { status: "ok", digestsSent },
    { headers: { "x-request-id": requestId } },
  );
}
