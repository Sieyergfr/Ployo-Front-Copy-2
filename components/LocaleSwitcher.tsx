"use client";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_DAYS } from "@/lib/locale-shared";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";

const availableLocales = [
  { code: "de", label: "DE" },
  { code: "en", label: "EN" },
] as const;

function writeLocaleCookie(code: string) {
  const maxAge = LOCALE_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * Sprachumschalter für Seiten ohne Session (Login, Marketing, Legal) — setzt
 * nur den `ployo-locale`-Cookie (siehe lib/i18n.ts), keine DB-Präferenz.
 * Angemeldete Nutzer haben stattdessen den Umschalter in der Navigation
 * (components/Navigation.tsx), der über switchLanguageAction persistiert.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const currentLocale = useLocale();
  const router = useRouter();

  return (
    <div className={className ?? "inline-flex items-center gap-1.5"}>
      {availableLocales.map((locale) => (
        <button
          key={locale.code}
          type="button"
          disabled={currentLocale === locale.code}
          onClick={() => {
            writeLocaleCookie(locale.code);
            router.refresh();
          }}
          className={`cursor-pointer font-mono text-[11px] uppercase tracking-[0.06em] transition-colors disabled:cursor-default ${
            currentLocale === locale.code
              ? "font-semibold text-ink"
              : "text-muted hover:text-ink"
          }`}
        >
          {locale.label}
        </button>
      ))}
    </div>
  );
}
