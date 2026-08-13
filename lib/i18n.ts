import "server-only";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { preferenceLanguages } from "@/lib/account-service";
import { headers } from "next/headers";

export const defaultLocale = "de";
export const locales = preferenceLanguages;
export type Locale = (typeof locales)[number];

function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/**
 * Locale fürs aktuelle Request: aus der gespeicherten Nutzer-Präferenz
 * (`UserPreference.language`), sonst Standard "de". Kein Cookie/Header-
 * Fallback nötig — nicht angemeldete Seiten (Login, Marketing) bleiben
 * ohnehin Deutsch, bis sie ebenfalls ans Katalog-System angeschlossen sind.
 */
export async function resolveLocale(): Promise<Locale> {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);

  if (!session?.user?.id) {
    return defaultLocale;
  }

  const preference = await prisma.userPreference.findUnique({
    where: { userId: session.user.id },
    select: { language: true },
  });

  return preference && isLocale(preference.language) ? preference.language : defaultLocale;
}
