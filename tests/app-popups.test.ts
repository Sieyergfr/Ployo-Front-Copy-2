import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { dismissAppPopup, getPendingAppPopups } from "@/lib/app-popups";

/**
 * Integrationstest gegen die Test-DB. Popups sind Ployo-weit, deshalb
 * filtert jede Prüfung auf die hier angelegten IDs — andere Popups in der
 * Test-DB dürfen das Ergebnis nicht verfälschen.
 */

const RUN_ID = Math.random().toString(36).slice(2);
const popupIds: string[] = [];
let userId: string;
let otherUserId: string;

async function createPopup(data: Partial<Parameters<typeof prisma.appPopup.create>[0]["data"]> = {}) {
  const popup = await prisma.appPopup.create({
    data: { title: `Popup ${RUN_ID}`, body: "Inhalt", ...data },
  });
  popupIds.push(popup.id);

  return popup;
}

async function pendingIds(forUserId: string, now?: Date) {
  return (await getPendingAppPopups(forUserId, now))
    .map((popup) => popup.id)
    .filter((id) => popupIds.includes(id));
}

beforeAll(async () => {
  userId = (
    await prisma.user.create({ data: { name: "Popup User", email: `popup-${RUN_ID}@test.invalid` } })
  ).id;
  otherUserId = (
    await prisma.user.create({ data: { name: "Other User", email: `popup-other-${RUN_ID}@test.invalid` } })
  ).id;
});

afterAll(async () => {
  await prisma.appPopup.deleteMany({ where: { id: { in: popupIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
});

describe("App-Popups", () => {
  it("liefert aktive Popups nach Priorität, dann nach Alter", async () => {
    const low = await createPopup({ priority: 0 });
    const high = await createPopup({ priority: 10 });
    const lowLater = await createPopup({ priority: 0 });

    expect(await pendingIds(userId)).toEqual([high.id, low.id, lowLater.id]);
  });

  it("blendet inaktive und außerhalb des Zeitfensters liegende Popups aus", async () => {
    const now = new Date("2026-11-15T12:00:00Z");
    const inactive = await createPopup({ active: false });
    const future = await createPopup({ startsAt: new Date("2026-12-01T00:00:00Z") });
    const expired = await createPopup({ endsAt: new Date("2026-11-01T00:00:00Z") });
    const running = await createPopup({
      startsAt: new Date("2026-11-01T00:00:00Z"),
      endsAt: new Date("2026-12-01T00:00:00Z"),
    });

    const ids = await pendingIds(userId, now);

    expect(ids).toContain(running.id);
    expect(ids).not.toContain(inactive.id);
    expect(ids).not.toContain(future.id);
    expect(ids).not.toContain(expired.id);
  });

  it("zeigt ein geschlossenes Popup nur diesem Nutzer nicht mehr", async () => {
    const popup = await createPopup();

    expect(await dismissAppPopup(userId, popup.id)).toBe(true);
    // Doppelt schließen (z. B. Netz-Retry) ist kein Fehler.
    expect(await dismissAppPopup(userId, popup.id)).toBe(true);

    expect(await pendingIds(userId)).not.toContain(popup.id);
    expect(await pendingIds(otherUserId)).toContain(popup.id);
  });

  it("meldet unbekannte Popups", async () => {
    expect(await dismissAppPopup(userId, `missing-${RUN_ID}`)).toBe(false);
  });
});
