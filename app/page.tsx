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
import "./landing.css";

export const metadata = {
  title: "Schichtplanung, Personalakte & Analytics für Teams",
  description:
    "Ployo vereint Schichtplanung, Personalverwaltung und standortübergreifende Analyse — in einer schlanken, modernen Plattform.",
};

const navLinks = [
  { label: "Funktionen", href: "#features" },
  { label: "So funktioniert's", href: "#how" },
  { label: "Preise", href: "#" },
  { label: "Unternehmen", href: "#" },
];

const featureColors = {
  ac: {
    fg: "var(--lp-ac)",
    bg: "var(--lp-ac-dim)",
    border: "rgba(77,255,166,.14)",
  },
  blue: {
    fg: "var(--lp-blue)",
    bg: "rgba(77,159,255,.08)",
    border: "rgba(77,159,255,.14)",
  },
  red: {
    fg: "var(--lp-red)",
    bg: "rgba(255,77,106,.08)",
    border: "rgba(255,77,106,.14)",
  },
} as const;

const features = [
  {
    icon: CalendarClock,
    color: "ac",
    title: "Intelligente Schichtplanung",
    description:
      "Automatische Vorschläge basierend auf Qualifikationen, Verfügbarkeiten und gesetzlichen Vorgaben. Frühzeitige Erkennung von Unterbesetzung.",
    points: [
      "Drag-and-Drop Kalender",
      "Automatische Konfliktprüfung",
      "Push-Benachrichtigungen",
    ],
  },
  {
    icon: Users,
    color: "blue",
    title: "Digitale Personalakte",
    description:
      "Alle Mitarbeiterdaten DSGVO-konform an einem Ort. Verträge, Zeugnisse, Urlaubsanträge — revisionssicher und sofort abrufbar.",
    points: [
      "DSGVO-konforme Speicherung",
      "Dokumenten-Upload & -Verwaltung",
      "Rollenbasierte Zugriffsrechte",
    ],
  },
  {
    icon: BarChart3,
    color: "red",
    title: "Echtzeit-Analytics",
    description:
      "Überblick über alle Standorte in Echtzeit. Auslastung, Krankheitsquoten, Überstunden — auf einen Blick, immer aktuell.",
    points: [
      "Live-Dashboard aller Standorte",
      "Exportierbare Berichte (Excel, PDF)",
      "Frühwarnsystem für Engpässe",
    ],
  },
] as const;

const steps = [
  {
    number: "01",
    title: "Konto einrichten",
    description:
      "In wenigen Minuten registriert. Standorte anlegen, Team einladen, Rollen vergeben — sofort einsatzbereit.",
    highlight: false,
  },
  {
    number: "02",
    title: "Daten importieren",
    description:
      "Mitarbeiterdaten aus Excel oder bestehenden Systemen importieren. Ployo erkennt Formate automatisch.",
    highlight: false,
  },
  {
    number: "03",
    title: "Loslegen & sparen",
    description:
      "Schichtpläne erstellen, Personalakten pflegen, Analytics auswerten — und bis zu 40 Stunden im Monat einsparen.",
    highlight: true,
  },
] as const;

const shiftLoads = [
  { label: "Frühschicht", value: "28/30", pct: 93, color: "var(--lp-ac)" },
  { label: "Spätschicht", value: "22/30", pct: 73, color: "var(--lp-blue)" },
  { label: "Nachtschicht", value: "8/12", pct: 67, color: "var(--lp-red)" },
];

function LogoMark({ size, radius }: { size: number; radius: number }) {
  return (
    <div
      className="flex flex-none items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "var(--lp-tx)",
      }}
    >
      <Image
        src="/logo_square_brand.svg"
        alt=""
        width={Math.round(size * 0.57)}
        height={Math.round(size * 0.57)}
      />
    </div>
  );
}

export default function Home() {
  return (
    <div className="landing min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
      {/* ─── NAV ─────────────────────────────── */}
      <header
        className="fixed top-0 right-0 left-0 z-[100] h-16 backdrop-blur-[22px]"
        style={{
          borderBottom: "1px solid var(--lp-bd)",
          background: "rgba(7,7,12,.82)",
        }}
      >
        <div className="mx-auto flex h-full max-w-[1200px] items-center px-5 sm:px-6 lg:px-10">
          <Link
            href="/"
            className="lp-fi flex flex-none items-center gap-2.5"
            style={{ animationDelay: ".06s" }}
          >
            <LogoMark size={30} radius={9} />
            <span className="font-display text-[18px] font-semibold tracking-[-0.3px] text-[var(--lp-tx)]">
              Ployo
            </span>
          </Link>

          <nav
            className="lp-fi hidden flex-1 items-center justify-center gap-9 md:flex"
            style={{ animationDelay: ".16s" }}
          >
            {navLinks.map((link) => (
              <a key={link.label} href={link.href} className="lp-nav-link text-[13.5px]">
                {link.label}
              </a>
            ))}
          </nav>

          <div
            className="lp-fi ml-auto flex flex-none items-center gap-3 sm:gap-4 md:ml-0"
            style={{ animationDelay: ".26s" }}
          >
            <Link href="/login" className="lp-nav-link text-[13.5px]">
              Anmelden
            </Link>
            <Link
              href="/register"
              className="lp-btn-primary rounded-[9px] px-3 py-[9px] text-[13px] font-semibold text-black sm:px-[18px]"
              style={{ background: "var(--lp-ac)" }}
            >
              <span className="sm:hidden">Start</span>
              <span className="hidden sm:inline">Kostenlos starten</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── HERO ─────────────────────────────── */}
      <section className="relative flex min-h-screen items-center overflow-hidden pt-16">
        <div
          className="pointer-events-none absolute top-[46%] left-[58%] h-[560px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(ellipse, var(--lp-ac-glow) 0%, transparent 68%)",
            animation: "lp-glow-pulse 7s ease-in-out infinite",
          }}
        />
        <div
          className="pointer-events-none absolute top-[28%] right-[6%] h-[320px] w-[320px] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse, rgba(77,159,255,.06) 0%, transparent 70%)",
            animation: "lp-glow-pulse 9s ease-in-out infinite 2.5s",
          }}
        />

        <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-x-[72px] gap-y-16 px-5 sm:px-6 lg:grid-cols-2 lg:px-10">
          {/* Text */}
          <div>
            <div
              className="lp-fu mb-[30px] inline-flex items-center gap-2 rounded-full py-1.5 pr-[14px] pl-2.5"
              style={{
                border: "1px solid var(--lp-bd-hi)",
                background: "var(--lp-surf)",
                animationDelay: ".06s",
              }}
            >
              <span
                className="h-1.5 w-1.5 flex-none rounded-full"
                style={{
                  background: "var(--lp-ac)",
                  animation: "lp-blink 2s ease infinite",
                }}
              />
              <span className="font-mono text-[11px] tracking-[0.4px] text-[var(--lp-tx2)]">
                NEU — Digitale Schichtplanung
              </span>
            </div>

            <h1 className="font-display text-[clamp(40px,9vw,82px)] leading-[1.0] font-bold tracking-[-2.8px] text-[var(--lp-tx)]">
              <span className="lp-fu mb-1 block" style={{ animationDelay: ".16s" }}>
                Smarter HR.
              </span>
              <span
                className="lp-fu mb-7 block bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(95deg, var(--lp-ac) 20%, var(--lp-blue) 100%)",
                  animationDelay: ".26s",
                }}
              >
                Starke Teams.
              </span>
            </h1>

            <p
              className="lp-fu mb-10 max-w-[450px] text-[17px] leading-[1.68] text-[var(--lp-tx2)]"
              style={{ animationDelay: ".38s" }}
            >
              Ployo vereint Schichtplanung, Personalverwaltung und
              standortübergreifende Analyse — in einer schlanken, modernen
              Plattform.
            </p>

            <div
              className="lp-fu flex flex-wrap items-center gap-3"
              style={{ animationDelay: ".52s" }}
            >
              <Link
                href="/register"
                className="lp-btn-primary inline-flex items-center gap-2 rounded-[11px] px-6 py-3.5 text-[14.5px] font-semibold text-black"
                style={{ background: "var(--lp-ac)" }}
              >
                Kostenlos testen
                <ArrowRight size={14} strokeWidth={2.2} />
              </Link>
              <a
                href="#features"
                className="lp-btn-secondary inline-flex items-center gap-2 rounded-[11px] px-6 py-3.5 text-[14.5px] font-medium text-[var(--lp-tx2)]"
                style={{ border: "1px solid var(--lp-bd-hi)" }}
              >
                <PlayCircle size={14} strokeWidth={2} />
                Demo ansehen
              </a>
            </div>

          </div>

          {/* Dashboard card */}
          <div
            className="lp-fi relative flex items-center justify-center py-8"
            style={{ animationDelay: ".38s" }}
          >
            <div
              className="relative w-full max-w-[400px] overflow-hidden rounded-[20px]"
              style={{
                background: "var(--lp-surf)",
                border: "1px solid var(--lp-bd-hi)",
                boxShadow: "0 40px 80px rgba(0,0,0,.5), 0 0 0 1px var(--lp-bd)",
                animation: "lp-float 7s ease-in-out infinite",
              }}
            >
              <div
                className="pointer-events-none absolute right-0 left-0 h-px opacity-50"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, var(--lp-ac), transparent)",
                  animation: "lp-scan 5s linear infinite",
                }}
              />

              <div
                className="flex items-center justify-between px-5 py-4"
                style={{ borderBottom: "1px solid var(--lp-bd)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-[7px] w-[7px] rounded-full"
                    style={{
                      background: "var(--lp-ac)",
                      animation: "lp-blink 2s ease infinite",
                    }}
                  />
                  <span className="font-mono text-[11px] tracking-[0.5px] text-[var(--lp-tx2)]">
                    PLOYO LIVE
                  </span>
                </div>
                <span className="font-mono text-[10px]" style={{ color: "var(--lp-mu)" }}>
                  KW 26 · 2025
                </span>
              </div>

              <div
                className="grid grid-cols-3"
                style={{ borderBottom: "1px solid var(--lp-bd)" }}
              >
                {[
                  { label: "Mitarbeiter", value: "84" },
                  { label: "Standorte", value: "4" },
                  { label: "Auslastung", value: "87%", accent: true },
                ].map((cell, index) => (
                  <div
                    key={cell.label}
                    className="px-3 py-4 sm:px-[18px]"
                    style={
                      index < 2
                        ? { borderRight: "1px solid var(--lp-bd)" }
                        : undefined
                    }
                  >
                    <div
                      className="mb-2 font-mono text-[9px] tracking-[0.5px] uppercase"
                      style={{ color: "var(--lp-mu)" }}
                    >
                      {cell.label}
                    </div>
                    <div
                      className="font-display text-2xl font-bold tracking-[-1.2px] sm:text-[30px]"
                      style={{ color: cell.accent ? "var(--lp-ac)" : "var(--lp-tx)" }}
                    >
                      {cell.value}
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="flex flex-col gap-[13px] px-5 pt-[18px] pb-3.5"
                style={{ borderBottom: "1px solid var(--lp-bd)" }}
              >
                {shiftLoads.map((shift) => (
                  <div key={shift.label}>
                    <div className="mb-[7px] flex justify-between">
                      <span className="text-[12.5px] text-[var(--lp-tx2)]">
                        {shift.label}
                      </span>
                      <span
                        className="font-mono text-[11px]"
                        style={{ color: shift.color }}
                      >
                        {shift.value}
                      </span>
                    </div>
                    <div
                      className="h-[3px] overflow-hidden rounded-[3px]"
                      style={{ background: "var(--lp-surf2)" }}
                    >
                      <div
                        className="h-full rounded-[3px]"
                        style={{ width: `${shift.pct}%`, background: shift.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2.5 px-5 py-3.5">
                <div
                  className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] text-[9px] font-bold"
                  style={{
                    background: "rgba(77,255,166,.08)",
                    border: "1px solid rgba(77,255,166,.15)",
                    color: "var(--lp-ac)",
                  }}
                >
                  TB
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium text-[var(--lp-tx)]">
                    Thomas Berger
                  </div>
                  <div
                    className="mt-0.5 font-mono text-[10px]"
                    style={{ color: "var(--lp-mu)" }}
                  >
                    Schichtplan KW 27 freigegeben
                  </div>
                </div>
                <span
                  className="h-1.5 w-1.5 flex-none rounded-full"
                  style={{ background: "var(--lp-ac)" }}
                />
              </div>
            </div>

            {/* Floating badge */}
            <div
              className="absolute right-[-10px] bottom-0 rounded-[14px] px-[18px] py-3.5"
              style={{
                background: "var(--lp-surf)",
                border: "1px solid var(--lp-bd-hi)",
                boxShadow: "0 20px 50px rgba(0,0,0,.5)",
                animation: "lp-float-b 5s ease-in-out infinite 1.8s",
              }}
            >
              <div
                className="mb-2 font-mono text-[9px] tracking-[0.5px] uppercase"
                style={{ color: "var(--lp-mu)" }}
              >
                Offene Schichten
              </div>
              <div
                className="font-display text-[34px] leading-none font-bold tracking-[-1.5px]"
                style={{ color: "var(--lp-red)" }}
              >
                7
              </div>
              <div className="mt-[5px] text-[11.5px] text-[var(--lp-tx2)]">
                Diese Woche
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─────────────────────────── */}
      <section
        id="features"
        className="scroll-mt-16 px-5 py-20 sm:px-6 lg:px-10 lg:py-[120px]"
        style={{ borderBottom: "1px solid var(--lp-bd)" }}
      >
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-[72px]">
            <div
              className="mb-4 font-mono text-[10px] tracking-[1px] uppercase"
              style={{ color: "var(--lp-ac)" }}
            >
              Funktionen
            </div>
            <h2 className="font-display max-w-[540px] text-[clamp(30px,5vw,54px)] leading-[1.05] font-bold tracking-[-1.8px] text-[var(--lp-tx)]">
              Alles, was modernes HR braucht.
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {features.map((feature) => {
              const colors = featureColors[feature.color as keyof typeof featureColors];
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="lp-feature-card rounded-[18px] p-6 sm:p-8"
                  style={{ background: "var(--lp-surf)", border: "1px solid var(--lp-bd)" }}
                >
                  <div
                    className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
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
                        <span
                          className="h-[5px] w-[5px] flex-none rounded-full"
                          style={{ background: colors.fg }}
                        />
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
        className="scroll-mt-16 px-5 py-20 sm:px-6 lg:px-10 lg:py-[120px]"
        style={{ borderBottom: "1px solid var(--lp-bd)" }}
      >
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-12 sm:mb-20">
            <div
              className="mb-4 font-mono text-[10px] tracking-[1px] uppercase"
              style={{ color: "var(--lp-ac)" }}
            >
              So funktioniert&apos;s
            </div>
            <h2 className="font-display text-[clamp(30px,5vw,54px)] leading-[1.05] font-bold tracking-[-1.8px] text-[var(--lp-tx)]">
              In drei Schritten startklar.
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-y-10 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number} className="lp-step">
                <div
                  className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={
                    step.highlight
                      ? {
                          border: "1px solid rgba(77,255,166,.28)",
                          background: "rgba(77,255,166,.05)",
                        }
                      : { border: "1px solid var(--lp-bd-hi)", background: "var(--lp-surf)" }
                  }
                >
                  <span
                    className="font-mono text-[22px] font-bold"
                    style={{ color: "var(--lp-ac)" }}
                  >
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
      <section
        className="px-5 py-16 sm:px-6 lg:px-10 lg:py-[100px]"
        style={{ borderBottom: "1px solid var(--lp-bd)" }}
      >
        <div className="mx-auto max-w-[720px] text-center">
          <div aria-hidden className="mb-6 text-[40px] leading-none" style={{ color: "var(--lp-mu)" }}>
            &ldquo;
          </div>
          <blockquote className="font-display mb-9 text-[clamp(20px,4vw,30px)] leading-[1.35] font-medium tracking-[-0.6px] text-[var(--lp-tx)]">
            Ployo hat unsere Schichtplanung von 8 Stunden auf unter 45 Minuten
            pro Woche reduziert. Ich kann mir ein Arbeiten ohne es nicht mehr
            vorstellen.
          </blockquote>
          <div className="flex items-center justify-center gap-3.5">
            <div
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-full text-[12px] font-bold text-[var(--lp-tx2)]"
              style={{ background: "var(--lp-surf)", border: "1px solid var(--lp-bd-hi)" }}
            >
              MK
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-[var(--lp-tx)]">Maria Koch</div>
              <div className="mt-[3px] font-mono text-[11px]" style={{ color: "var(--lp-mu)" }}>
                HR-Leitung · Hamburg Altona
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ───────────────────────────────── */}
      <section className="px-5 py-16 sm:px-6 lg:px-10 lg:py-[120px]">
        <div className="mx-auto max-w-[1200px]">
          <div
            className="relative overflow-hidden rounded-3xl px-6 py-14 text-center sm:px-10 sm:py-16 md:px-20 lg:py-[90px]"
            style={{ background: "var(--lp-surf)", border: "1px solid var(--lp-bd-hi)" }}
          >
            <div
              className="pointer-events-none absolute top-1/2 left-1/2 h-[350px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(ellipse, var(--lp-ac-glow) 0%, transparent 68%)",
                animation: "lp-glow-pulse 6s ease-in-out infinite",
              }}
            />
            <div className="relative z-[1]">
              <div
                className="mb-5 font-mono text-[10px] tracking-[1px] uppercase"
                style={{ color: "var(--lp-ac)" }}
              >
                Jetzt starten — kostenlos
              </div>
              <h2 className="font-display mb-5 text-[clamp(32px,7vw,68px)] leading-[1.0] font-bold tracking-[-2.2px] text-[var(--lp-tx)]">
                Ihr Team verdient
                <br />
                besseres HR.
              </h2>
              <p className="mx-auto mb-11 max-w-[420px] text-base leading-[1.65] text-[var(--lp-tx2)]">
                14 Tage kostenlos testen. Keine Kreditkarte nötig. Jederzeit
                kündbar.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3.5">
                <Link
                  href="/register"
                  className="lp-btn-primary inline-flex items-center gap-2 rounded-xl px-[30px] py-[15px] text-[15px] font-bold text-black"
                  style={{ background: "var(--lp-ac)" }}
                >
                  Kostenlos testen
                  <ArrowRight size={14} strokeWidth={2.2} />
                </Link>
                <a
                  href="#"
                  className="lp-btn-secondary rounded-xl px-[30px] py-[15px] text-[15px] font-medium text-[var(--lp-tx2)]"
                  style={{ border: "1px solid var(--lp-bd-hi)" }}
                >
                  Demo buchen
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ────────────────────────────── */}
      <footer
        className="px-5 py-9 sm:px-6 lg:px-10"
        style={{ borderTop: "1px solid var(--lp-bd)" }}
      >
        <div className="mx-auto flex max-w-[1200px] flex-col flex-wrap items-center justify-between gap-5 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-2.5">
            <LogoMark size={26} radius={8} />
            <span className="font-display text-base font-semibold tracking-[-0.3px]">
              Ployo
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-7">
            <Link href="/datenschutz" className="lp-footer-link text-[13px]" style={{ color: "var(--lp-mu)" }}>
              Datenschutz
            </Link>
            <Link href="/impressum" className="lp-footer-link text-[13px]" style={{ color: "var(--lp-mu)" }}>
              Impressum
            </Link>
            <Link href="/agb" className="lp-footer-link text-[13px]" style={{ color: "var(--lp-mu)" }}>
              AGB
            </Link>
            <a href="#" className="lp-footer-link text-[13px]" style={{ color: "var(--lp-mu)" }}>
              Kontakt
            </a>
            <CookieSettingsLink
              className="lp-footer-link text-[13px] cursor-pointer"
              style={{ color: "var(--lp-mu)" }}
            />
          </div>
          <span className="font-mono text-[11px]" style={{ color: "var(--lp-mu)" }}>
            © {new Date().getFullYear()} Ployo · Made in Germany
          </span>
        </div>
      </footer>
    </div>
  );
}
