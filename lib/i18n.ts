import "server-only";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { preferenceLanguages } from "@/lib/account-service";
import { LOCALE_COOKIE } from "@/lib/locale-shared";
import { cookies, headers } from "next/headers";

export const defaultLocale = "de";
export const locales = preferenceLanguages;
export type Locale = (typeof locales)[number];

function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/**
 * Locale fürs aktuelle Request: angemeldete Nutzer über die gespeicherte
 * Präferenz (`UserPreference.language`); ohne Session (oder ohne
 * gespeicherte Präferenz) über den `ployo-locale`-Cookie, den
 * `components/LocaleSwitcher.tsx` auf Login-/Marketing-/Legal-Seiten setzt.
 * Letzter Fallback: "de".
 */
export async function resolveLocale(): Promise<Locale> {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);

  if (session?.user?.id) {
    const preference = await prisma.userPreference.findUnique({
      where: { userId: session.user.id },
      select: { language: true },
    });

    if (preference && isLocale(preference.language)) {
      return preference.language;
    }
  }

  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;

  return cookieLocale && isLocale(cookieLocale) ? cookieLocale : defaultLocale;
}
