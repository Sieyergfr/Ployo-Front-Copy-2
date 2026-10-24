import { prisma } from "@/lib/prisma";

/**
 * Popups in der Mitarbeiter-App (Bottom-Sheet). Ployo-weit, nicht an einen
 * Mandanten gebunden. Ein Popup ist sichtbar, solange es aktiv ist, im
 * Zeitfenster liegt und der Nutzer es noch nicht geschlossen hat.
 */

export type AppPopupPayload = {
  id: string;
  title: string;
  body: string;
  titleEn: string | null;
  bodyEn: string | null;
  imageUrl: string | null;
  buttonLabel: string | null;
  buttonLabelEn: string | null;
  buttonUrl: string | null;
};

/** Reihenfolge, in der die App sie nacheinander zeigt: höhere Priorität zuerst, dann älteste zuerst. */
export async function getPendingAppPopups(userId: string, now = new Date()): Promise<AppPopupPayload[]> {
  return prisma.appPopup.findMany({
    where: {
      active: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
      dismissals: { none: { userId } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      body: true,
      titleEn: true,
      bodyEn: true,
      imageUrl: true,
      buttonLabel: true,
      buttonLabelEn: true,
      buttonUrl: true,
    },
  });
}

/** Merkt sich das Schließen; wiederholtes Schließen ist kein Fehler. `false`, wenn es das Popup nicht gibt. */
export async function dismissAppPopup(userId: string, popupId: string): Promise<boolean> {
  const popup = await prisma.appPopup.findUnique({ where: { id: popupId }, select: { id: true } });

  if (!popup) {
    return false;
  }

  await prisma.appPopupDismissal.upsert({
    where: { popupId_userId: { popupId, userId } },
    create: { popupId, userId },
    update: {},
  });

  return true;
}
