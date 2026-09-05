import "server-only";
import { prisma } from "@/lib/prisma";

const TRACKED_PATH_PREFIXES = [
  "/",
  "/login",
  "/register",
  "/impressum",
  "/datenschutz",
  "/agb",
  "/kontakt",
];

const MAX_PATH_LENGTH = 200;

/** Nur die öffentlichen Marketing-/Rechtsseiten zählen — dieselbe Fläche wie app/sitemap.ts. */
export function isTrackablePath(path: string) {
  return TRACKED_PATH_PREFIXES.some(
    (prefix) => path === prefix || (prefix !== "/" && path.startsWith(`${prefix}/`)),
  );
}

/** Nur der Hostname des Referrers — nie die volle URL (könnte Query-Tokens enthalten). */
export function referrerHostFrom(referrer: string | null): string {
  if (!referrer) return "";

  try {
    return new URL(referrer).hostname;
  } catch {
    return "";
  }
}

export async function recordPageView(input: { path: string; referrerHost: string }) {
  if (!isTrackablePath(input.path)) {
    return;
  }

  await prisma.pageView.create({
    data: {
      path: input.path.slice(0, MAX_PATH_LENGTH),
      referrerHost: input.referrerHost.slice(0, MAX_PATH_LENGTH),
    },
  });
}

export type PageViewSummaryRow = {
  path: string;
  views: number;
};

/** Aufrufe pro Seite der letzten `days` Tage, absteigend sortiert. */
export async function getPageViewSummary(days: number): Promise<PageViewSummaryRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const grouped = await prisma.pageView.groupBy({
    by: ["path"],
    where: { occurredAt: { gte: since } },
    _count: { path: true },
  });

  return grouped
    .map((row) => ({ path: row.path, views: row._count.path }))
    .sort((a, b) => b.views - a.views);
}
