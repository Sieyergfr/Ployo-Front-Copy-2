"use client";

import { authClient } from "@/lib/auth-client";
import { ChevronDown, LayoutDashboard, LogOut, Menu, User, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const navItems = [
  { href: "#vorteile", key: "navFeatures" },
  { href: "#app", key: "navApp" },
  { href: "#sicherheit", key: "navSecurity" },
  { href: "#preise", key: "navPricing" },
] as const;

function AccountMenu() {
  const t = useTranslations("LandingPage.header");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="pl-link pl-press pl-focus flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border-0 bg-transparent py-[5px] pr-3 pl-[5px] text-[14px] font-semibold text-ink"
      >
        <span className="pl-avatar flex size-8 items-center justify-center rounded-full text-[#7a3c9c]">
          <User size={16} strokeWidth={2} aria-hidden="true" />
        </span>
        <span>{t("account")}</span>
        <ChevronDown size={14} strokeWidth={2} className="text-muted" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="pl-menu absolute top-[calc(100%+14px)] right-0 z-20 box-border w-60 rounded-xl border border-[rgba(236,235,231,0.9)] bg-white/[0.92] p-1.5"
        >
          <div className="px-3 pt-2.5 pb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
            {t("account")}
          </div>
          <Link
            href="/select"
            role="menuitem"
            className="pl-item pl-focus flex items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-[13.5px] font-medium text-ink"
          >
            <LayoutDashboard size={15} strokeWidth={2} className="text-muted" aria-hidden="true" />
            {t("toDashboard")}
          </Link>
          <Link
            href="/konto"
            role="menuitem"
            className="pl-item pl-focus flex items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-[13.5px] font-medium text-ink"
          >
            <User size={15} strokeWidth={2} className="text-muted" aria-hidden="true" />
            {t("accountSettings")}
          </Link>
          <div className="mx-1 my-1.5 h-px bg-border-soft" />
          <form action="/logout" method="post">
            <button
              type="submit"
              role="menuitem"
              className="pl-item pl-focus flex w-full cursor-pointer items-center gap-2.5 rounded-[9px] border-0 bg-transparent px-3 py-2.5 text-left text-[13.5px] font-medium text-ink"
            >
              <LogOut size={15} strokeWidth={2} className="text-muted" aria-hidden="true" />
              {t("logout")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function LandingHeader() {
  const t = useTranslations("LandingPage.header");
  // Clientseitig, damit die Landingpage statisch bleibt. Bis die Session
  // geladen ist, erscheinen die Buttons für Gäste.
  const { data: session } = authClient.useSession();
  const loggedIn = Boolean(session?.user);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="pointer-events-none sticky top-0 z-50 -mb-[74px] px-[clamp(12px,3vw,24px)] pt-3.5">
      <div className="pl-bar pointer-events-auto mx-auto max-w-[1080px] rounded-2xl">
        <div className="box-border flex h-[60px] items-center justify-between gap-4 pr-2 pl-[18px]">
          <Link
            href="/"
            aria-label={t("homeAria")}
            className="pl-focus flex shrink-0 items-center gap-2 rounded-[9px] text-ink"
          >
            <Image src="/logo_square_brand.svg" alt="" width={22} height={22} priority />
            <span className="font-display text-[18px] leading-none font-semibold tracking-[-0.4px]">
              Ployo
            </span>
          </Link>

          <nav aria-label={t("mainNavigation")} className="flex items-center gap-0.5 max-[880px]:hidden">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="pl-link pl-focus rounded-[9px] px-3.5 py-2 text-[14px] font-medium text-muted-2"
              >
                {t(item.key)}
              </a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {loggedIn ? (
              <AccountMenu />
            ) : (
              <div className="flex items-center gap-2 max-[880px]:hidden">
                <Link
                  href="/login"
                  className="pl-link pl-press pl-focus inline-flex min-h-11 items-center rounded-[10px] px-3.5 py-2.5 text-[14px] font-medium text-ink"
                >
                  {t("login")}
                </Link>
                <Link
                  href="/register"
                  className="pl-cta pl-press pl-focus inline-flex min-h-11 items-center justify-center rounded-[10px] bg-ink px-[18px] py-2.5 text-[14px] font-semibold text-white"
                >
                  <span>{t("register")}</span>
                </Link>
              </div>
            )}

            <button
              type="button"
              aria-label={mobileOpen ? t("closeMenu") : t("openMenu")}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((value) => !value)}
              className="pl-link pl-focus inline-flex size-11 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent p-0 text-ink min-[881px]:hidden"
            >
              {mobileOpen ? (
                <X size={18} strokeWidth={2} aria-hidden="true" />
              ) : (
                <Menu size={18} strokeWidth={2} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="flex flex-col gap-1 border-t border-ink/[0.06] px-2.5 pt-2 pb-3 min-[881px]:hidden">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="pl-link pl-focus rounded-[9px] p-3 text-[15px] font-medium text-ink"
              >
                {t(item.key)}
              </a>
            ))}
            {!loggedIn && (
              <>
                <div className="my-2 h-px bg-border-soft" />
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/login"
                    className="pl-more pl-press pl-focus flex min-h-11 items-center justify-center rounded-[10px] px-[18px] py-2.5 text-[14px] font-semibold text-ink"
                  >
                    {t("login")}
                  </Link>
                  <Link
                    href="/register"
                    className="pl-cta pl-press pl-focus inline-flex min-h-11 items-center justify-center rounded-[10px] bg-ink px-[18px] py-2.5 text-[14px] font-semibold text-white"
                  >
                    <span>{t("register")}</span>
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
