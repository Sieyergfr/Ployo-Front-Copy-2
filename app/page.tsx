import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  PlayCircle,
  Users,
} from "lucide-react";
import { CookieSettingsLink } from "@/components/CookieSettingsLink";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import PageviewBeacon from "@/components/PageviewBeacon";
import { getTranslations } from "next-intl/server";
import "./landing.css";

export const metadata = {
  title: "Schichtplanung, Personalakte & Analytics für Teams",
  description:
    "Ployo vereint Schichtplanung, Personalverwaltung und standortübergreifende Analyse — in einer schlanken, modernen Plattform.",
};

type T = Awaited<ReturnType<typeof getTranslations>>;

function getNavLinks(t: T) {
  return [
    { label: t("navFeatures"), href: "#features" },
    { label: t("navHowItWorks"), href: "#how" },
    { label: t("navPricing"), href: "#" },
    { label: t("navCompany"), href: "#" },
  ];
}

/**
 * Feste, im Quelltext buchstäblich vorhandene Tailwind-Arbitrary-Klassen
 * statt roher CSS-Werte über style={{...}} — CSP style-src erlaubt das
 * style=""-Attribut nicht (siehe proxy.ts). `fg` bleibt eine reine CSS-Var-
 * Zeichenkette, weil sie nur an die Lucide-`color`-Prop geht (SVG-
 * Attribut, kein style, davon nicht betroffen).
 */
const featureColors = {
  ac: {
    fg: "var(--lp-ac)",
    bgClass: "bg-[color:var(--lp-ac-dim)]",
    borderClass: "border-[rgba(77,255,166,.14)]",
    dotClass: "bg-[color:var(--lp-ac)]",
  },
  blue: {
    fg: "var(--lp-blue)",
    bgClass: "bg-[rgba(77,159,255,.08)]",
    borderClass: "border-[rgba(77,159,255,.14)]",
    dotClass: "bg-[color:var(--lp-blue)]",
  },
  red: {
    fg: "var(--lp-red)",
    bgClass: "bg-[rgba(255,77,106,.08)]",
    borderClass: "border-[rgba(255,77,106,.14)]",
    dotClass: "bg-[color:var(--lp-red)]",
  },
} as const;

function getFeatures(t: T) {
  return [
    {
      icon: CalendarClock,
      color: "ac",
      title: t("feature1Title"),
      description: t("feature1Description"),
      points: [t("feature1Point1"), t("feature1Point2"), t("feature1Point3")],
    },
    {
      icon: Users,
      color: "blue",
      title: t("feature2Title"),
      description: t("feature2Description"),
      points: [t("feature2Point1"), t("feature2Point2"), t("feature2Point3")],
    },
    {
      icon: BarChart3,
      color: "red",
      title: t("feature3Title"),
      description: t("feature3Description"),
      points: [t("feature3Point1"), t("feature3Point2"), t("feature3Point3")],
    },
  ] as const;
}

function getSteps(t: T) {
  return [
    {
      number: "01",
      title: t("step1Title"),
      description: t("step1Description"),
      highlight: false,
    },
    {
      number: "02",
      title: t("step2Title"),
      description: t("step2Description"),
      highlight: false,
    },
    {
      number: "03",
      title: t("step3Title"),
      description: t("step3Description"),
      highlight: true,
    },
  ] as const;
}

// pct als feste Breiten-Klasse statt Laufzeitwert über style={{width}} —
// die drei Einträge sind ohnehin fest verdrahtete Demo-Werte, keine echten
// Laufzeitdaten.
function getShiftLoads(t: T) {
  return [
    {
      label: t("shiftEarly"),
      value: "28/30",
      widthClass: "w-[93%]",
      colorClass: "text-[color:var(--lp-ac)]",
      barClass: "bg-[color:var(--lp-ac)]",
    },
    {
      label: t("shiftLate"),
      value: "22/30",
      widthClass: "w-[73%]",
      colorClass: "text-[color:var(--lp-blue)]",
      barClass: "bg-[color:var(--lp-blue)]",
    },
    {
      label: t("shiftNight"),
      value: "8/12",
      widthClass: "w-[67%]",
      colorClass: "text-[color:var(--lp-red)]",
      barClass: "bg-[color:var(--lp-red)]",
    },
  ] as const;
}

function LogoMark({ variant }: { variant: "nav" | "footer" }) {
  // Math.round(size * 0.57): nav (size 30) -> 17, footer (size 26) -> 15.
  const sizeClass = variant === "nav" ? "size-[30px] rounded-[9px]" : "size-[26px] rounded-[8px]";
  const imgSize = variant === "nav" ? 17 : 15;

  return (
    <div
      className={`flex flex-none items-center justify-center bg-[color:var(--lp-tx)] ${sizeClass}`}
    >
      <Image src="/logo_square_brand.svg" alt="" width={imgSize} height={imgSize} />
    </div>
  );
}

export default async function Home() {
  const t = await getTranslations("LandingPage");
  const navLinks = getNavLinks(t);
  const features = getFeatures(t);
  const steps = getSteps(t);
  const shiftLoads = getShiftLoads(t);

  return (
    <div className="landing min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
      <PageviewBeacon />
      {/* ─── NAV ─────────────────────────────── */}
      <header className="fixed top-0 right-0 left-0 z-[100] h-16 border-b border-[color:var(--lp-bd)] bg-[rgba(7,7,12,.82)] backdrop-blur-[22px]">
        <div className="mx-auto flex h-full max-w-[1200px] items-center px-5 sm:px-6 lg:px-10">
          <Link
            href="/"
            className="lp-fi lp-delay-06 flex flex-none items-center gap-2.5"
          >
            <LogoMark variant="nav" />
            <span className="font-display text-[18px] font-semibold tracking-[-0.3px] text-[var(--lp-tx)]">
              Ployo
            </span>
          </Link>

          <nav className="lp-fi lp-delay-16 hidden flex-1 items-center justify-center gap-9 md:flex">
            {navLinks.map((link) => (
              <a key={link.label} href={link.href} className="lp-nav-link text-[13.5px]">
                {link.label}
              </a>
            ))}
          </nav>

          <div className="lp-fi lp-delay-26 ml-auto flex flex-none items-center gap-3 sm:gap-4 md:ml-0">
            <Link href="/login" className="lp-nav-link text-[13.5px]">
              {t("signIn")}
            </Link>
            <Link
              href="/register"
              className="lp-btn-primary rounded-[9px] bg-[color:var(--lp-ac)] px-3 py-[9px] text-[13px] font-semibold text-black sm:px-[18px]"
            >
              <span className="sm:hidden">{t("ctaStartShort")}</span>
              <span className="hidden sm:inline">{t("ctaStartFull")}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── HERO ─────────────────────────────── */}
      <section className="relative flex min-h-screen items-center overflow-hidden pt-16">
        <div className="lp-glow-hero-a pointer-events-none absolute top-[46%] left-[58%] h-[560px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full" />
        <div className="lp-glow-hero-b pointer-events-none absolute top-[28%] right-[6%] h-[320px] w-[320px] rounded-full" />

        <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-x-[72px] gap-y-16 px-5 sm:px-6 lg:grid-cols-2 lg:px-10">
          {/* Text */}
          <div>
            <div className="lp-fu lp-delay-06 mb-[30px] inline-flex items-center gap-2 rounded-full border border-[color:var(--lp-bd-hi)] bg-[color:var(--lp-surf)] py-1.5 pr-[14px] pl-2.5">
              <span className="lp-anim-blink h-1.5 w-1.5 flex-none rounded-full bg-[color:var(--lp-ac)]" />
              <span className="font-mono text-[11px] tracking-[0.4px] text-[var(--lp-tx2)]">
                {t("heroBadge")}
              </span>
            </div>

            <h1 className="font-display text-[clamp(40px,9vw,82px)] leading-[1.0] font-bold tracking-[-2.8px] text-[var(--lp-tx)]">
              <span className="lp-fu lp-delay-16 mb-1 block">
                {t("heroTitle1")}
              </span>
              <span className="lp-fu lp-delay-26 lp-text-gradient mb-7 block bg-clip-text text-transparent">
                {t("heroTitle2")}
              </span>
            </h1>

            <p className="lp-fu lp-delay-38 mb-10 max-w-[450px] text-[17px] leading-[1.68] text-[var(--lp-tx2)]">
              {t("heroDescription")}
            </p>

            <div className="lp-fu lp-delay-52 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="lp-btn-primary inline-flex items-center gap-2 rounded-[11px] bg-[color:var(--lp-ac)] px-6 py-3.5 text-[14.5px] font-semibold text-black"
              >
                {t("ctaFreeTrial")}
                <ArrowRight size={14} strokeWidth={2.2} />
              </Link>
              <a
                href="#features"
                className="lp-btn-secondary inline-flex items-center gap-2 rounded-[11px] border border-[color:var(--lp-bd-hi)] px-6 py-3.5 text-[14.5px] font-medium text-[var(--lp-tx2)]"
              >
                <PlayCircle size={14} strokeWidth={2} />
                {t("ctaWatchDemo")}
              </a>
            </div>

          </div>

          {/* Dashboard card */}
          <div className="lp-fi lp-delay-38 relative flex items-center justify-center py-8">
            <div className="lp-anim-float relative w-full max-w-[400px] overflow-hidden rounded-[20px] border border-[color:var(--lp-bd-hi)] bg-[color:var(--lp-surf)] shadow-[0_40px_80px_rgba(0,0,0,.5),0_0_0_1px_var(--lp-bd)]">
              <div className="lp-scan-line pointer-events-none absolute right-0 left-0 h-px opacity-50" />

              <div className="flex items-center justify-between border-b border-[color:var(--lp-bd)] px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="lp-anim-blink h-[7px] w-[7px] rounded-full bg-[color:var(--lp-ac)]" />
                  <span className="font-mono text-[11px] tracking-[0.5px] text-[var(--lp-tx2)]">
                    {t("mockLiveLabel")}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-[color:var(--lp-mu)]">
                  {t("mockWeekLabel", { week: 26, year: 2025 })}
                </span>
              </div>

              <div className="grid grid-cols-3 border-b border-[color:var(--lp-bd)]">
                {[
                  { label: t("mockEmployees"), value: "84" },
                  { label: t("mockLocations"), value: "4" },
                  { label: t("mockUtilization"), value: "87%", accent: true },
                ].map((cell, index) => (
                  <div
                    key={cell.label}
                    className={`px-3 py-4 sm:px-[18px] ${
                      index < 2 ? "border-r border-[color:var(--lp-bd)]" : ""
                    }`}
                  >
                    <div className="mb-2 font-mono text-[9px] tracking-[0.5px] text-[color:var(--lp-mu)] uppercase">
                      {cell.label}
                    </div>
                    <div
                      className={`font-display text-2xl font-bold tracking-[-1.2px] sm:text-[30px] ${
                        cell.accent ? "text-[color:var(--lp-ac)]" : "text-[color:var(--lp-tx)]"
                      }`}
                    >
                      {cell.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-[13px] border-b border-[color:var(--lp-bd)] px-5 pt-[18px] pb-3.5">
                {shiftLoads.map((shift) => (
                  <div key={shift.label}>
                    <div className="mb-[7px] flex justify-between">
                      <span className="text-[12.5px] text-[var(--lp-tx2)]">
                        {shift.label}
                      </span>
                      <span className={`font-mono text-[11px] ${shift.colorClass}`}>
                        {shift.value}
                      </span>
                    </div>
                    <div className="h-[3px] overflow-hidden rounded-[3px] bg-[color:var(--lp-surf2)]">
                      <div className={`h-full rounded-[3px] ${shift.widthClass} ${shift.barClass}`} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2.5 px-5 py-3.5">
                <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] border border-[rgba(77,255,166,.15)] bg-[rgba(77,255,166,.08)] text-[9px] font-bold text-[color:var(--lp-ac)]">
                  TB
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium text-[var(--lp-tx)]">
                    Thomas Berger
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-[color:var(--lp-mu)]">
                    {t("mockActivityLabel")}
                  </div>
                </div>
                <span className="h-1.5 w-1.5 flex-none rounded-full bg-[color:var(--lp-ac)]" />
              </div>
            </div>

            {/* Floating badge */}
            <div className="lp-anim-float-badge absolute right-[-10px] bottom-0 rounded-[14px] border border-[color:var(--lp-bd-hi)] bg-[color:var(--lp-surf)] px-[18px] py-3.5 shadow-[0_20px_50px_rgba(0,0,0,.5)]">
              <div className="mb-2 font-mono text-[9px] tracking-[0.5px] text-[color:var(--lp-mu)] uppercase">
                {t("mockOpenShiftsLabel")}
              </div>
              <div className="font-display text-[34px] leading-none font-bold tracking-[-1.5px] text-[color:var(--lp-red)]">
                7
              </div>
              <div className="mt-[5px] text-[11.5px] text-[var(--lp-tx2)]">
                {t("mockOpenShiftsCaption")}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─────────────────────────── */}
      <section
        id="features"
        className="scroll-mt-16 border-b border-[color:var(--lp-bd)] px-5 py-20 sm:px-6 lg:px-10 lg:py-[120px]"
      >
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-[72px]">
            <div className="mb-4 font-mono text-[10px] tracking-[1px] text-[color:var(--lp-ac)] uppercase">
              {t("featuresEyebrow")}
            </div>
            <h2 className="font-display max-w-[540px] text-[clamp(30px,5vw,54px)] leading-[1.05] font-bold tracking-[-1.8px] text-[var(--lp-tx)]">
              {t("featuresTitle")}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {features.map((feature) => {
              const colors = featureColors[feature.color as keyof typeof featureColors];
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="lp-feature-card rounded-[18px] border border-[color:var(--lp-bd)] bg-[color:var(--lp-surf)] p-6 sm:p-8"
                >
                  <div
                    className={`mb-6 flex h-11 w-11 items-center justify-center rounded-xl border ${colors.bgClass} ${colors.borderClass}`}
                  >
                    <Icon size={20} strokeWidth={1.8} color={colors.fg} />
                  </div>
                  <h3 className="font-display mb-3 text-xl font-semibold tracking-[-0.4px] text-[var(--lp-tx)]">
                    {feature.title}
                  </h3>
                  <p className="mb-6 text-sm leading-[1.65] text-[var(--lp-tx2)]">
                    {feature.description}
                  </p>
                  <div className="flex flex-col gap-2.5">
                    {feature.points.map((point) => (
                      <div key={point} className="flex items-center gap-2.5">
                        <span className={`h-[5px] w-[5px] flex-none rounded-full ${colors.dotClass}`} />
                        <span className="text-[13px] text-[var(--lp-tx2)]">{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─────────────────────── */}
      <section
        id="how"
        className="scroll-mt-16 border-b border-[color:var(--lp-bd)] px-5 py-20 sm:px-6 lg:px-10 lg:py-[120px]"
      >
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-12 sm:mb-20">
            <div className="mb-4 font-mono text-[10px] tracking-[1px] text-[color:var(--lp-ac)] uppercase">
              {t("howEyebrow")}
            </div>
            <h2 className="font-display text-[clamp(30px,5vw,54px)] leading-[1.05] font-bold tracking-[-1.8px] text-[var(--lp-tx)]">
              {t("howTitle")}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-y-10 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number} className="lp-step">
                <div
                  className={`mb-7 flex h-14 w-14 items-center justify-center rounded-2xl border ${
                    step.highlight
                      ? "border-[rgba(77,255,166,.28)] bg-[rgba(77,255,166,.05)]"
                      : "border-[color:var(--lp-bd-hi)] bg-[color:var(--lp-surf)]"
                  }`}
                >
                  <span className="font-mono text-[22px] font-bold text-[color:var(--lp-ac)]">
                    {step.number}
                  </span>
                </div>
                <h3 className="font-display mb-3 text-xl font-semibold tracking-[-0.4px] text-[var(--lp-tx)]">
                  {step.title}
                </h3>
                <p className="text-sm leading-[1.65] text-[var(--lp-tx2)]">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIAL ─────────────────────── */}
      <section className="border-b border-[color:var(--lp-bd)] px-5 py-16 sm:px-6 lg:px-10 lg:py-[100px]">
        <div className="mx-auto max-w-[720px] text-center">
          <div aria-hidden className="mb-6 text-[40px] leading-none text-[color:var(--lp-mu)]">
            &ldquo;
          </div>
          <blockquote className="font-display mb-9 text-[clamp(20px,4vw,30px)] leading-[1.35] font-medium tracking-[-0.6px] text-[var(--lp-tx)]">
            {t("testimonialQuote")}
          </blockquote>
          <div className="flex items-center justify-center gap-3.5">
            <div
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--lp-bd-hi)] bg-[color:var(--lp-surf)] text-[12px] font-bold text-[var(--lp-tx2)]"
            >
              MK
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-[var(--lp-tx)]">Maria Koch</div>
              <div className="mt-[3px] font-mono text-[11px] text-[color:var(--lp-mu)]">
                {t("testimonialRole")}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ───────────────────────────────── */}
      <section className="px-5 py-16 sm:px-6 lg:px-10 lg:py-[120px]">
        <div className="mx-auto max-w-[1200px]">
          <div className="relative overflow-hidden rounded-3xl border border-[color:var(--lp-bd-hi)] bg-[color:var(--lp-surf)] px-6 py-14 text-center sm:px-10 sm:py-16 md:px-20 lg:py-[90px]">
            <div className="lp-glow-cta pointer-events-none absolute top-1/2 left-1/2 h-[350px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full" />
            <div className="relative z-[1]">
              <div className="mb-5 font-mono text-[10px] tracking-[1px] text-[color:var(--lp-ac)] uppercase">
                {t("ctaEyebrow")}
              </div>
              <h2 className="font-display mb-5 text-[clamp(32px,7vw,68px)] leading-[1.0] font-bold tracking-[-2.2px] text-[var(--lp-tx)]">
                {t("ctaTitle1")}
                <br />
                {t("ctaTitle2")}
              </h2>
              <p className="mx-auto mb-11 max-w-[420px] text-base leading-[1.65] text-[var(--lp-tx2)]">
                {t("ctaDescription")}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3.5">
                <Link
                  href="/register"
                  className="lp-btn-primary inline-flex items-center gap-2 rounded-xl bg-[color:var(--lp-ac)] px-[30px] py-[15px] text-[15px] font-bold text-black"
                >
                  {t("ctaFreeTrial")}
                  <ArrowRight size={14} strokeWidth={2.2} />
                </Link>
                <a
                  href="#"
                  className="lp-btn-secondary rounded-xl border border-[color:var(--lp-bd-hi)] px-[30px] py-[15px] text-[15px] font-medium text-[var(--lp-tx2)]"
                >
                  {t("ctaBookDemo")}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ────────────────────────────── */}
      <footer className="border-t border-[color:var(--lp-bd)] px-5 py-9 sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-[1200px] flex-col flex-wrap items-center justify-between gap-5 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-2.5">
            <LogoMark variant="footer" />
            <span className="font-display text-base font-semibold tracking-[-0.3px]">
              Ployo
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-7">
            <Link href="/datenschutz" className="lp-footer-link text-[13px] text-[color:var(--lp-mu)]">
              {t("footerPrivacy")}
            </Link>
            <Link href="/impressum" className="lp-footer-link text-[13px] text-[color:var(--lp-mu)]">
              {t("footerImprint")}
            </Link>
            <Link href="/agb" className="lp-footer-link text-[13px] text-[color:var(--lp-mu)]">
              {t("footerTerms")}
            </Link>
            <Link href="/konto-loeschung" className="lp-footer-link text-[13px] text-[color:var(--lp-mu)]">
              {t("footerDeleteAccount")}
            </Link>
            <Link href="/kontakt" className="lp-footer-link text-[13px] text-[color:var(--lp-mu)]">
              {t("footerContact")}
            </Link>
            <CookieSettingsLink className="lp-footer-link text-[13px] text-[color:var(--lp-mu)] cursor-pointer" />
            <LocaleSwitcher />
          </div>
          <span className="font-mono text-[11px] text-[color:var(--lp-mu)]">
            {t("footerCopyright", { year: new Date().getFullYear() })}
          </span>
        </div>
      </footer>
    </div>
  );
}
