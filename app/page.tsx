import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Calendar,
  CalendarCheck,
  Check,
  Clock,
  Code,
  File,
  FileCheck,
  FileText,
  IdCard,
  KeyRound,
  Lock,
  Mail,
  MessageCircle,
  Plus,
  QrCode,
  Rocket,
  Server,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { CookieSettingsLink } from "@/components/CookieSettingsLink";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import PageviewBeacon from "@/components/PageviewBeacon";
import LandingFaq from "@/components/landing/LandingFaq";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingPointerEffects from "@/components/landing/LandingPointerEffects";
import PricingPlans from "@/components/landing/PricingPlans";
import RolePermissions from "@/components/landing/RolePermissions";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import "./landing.css";

export const metadata = {
  title: "Die digitale Personalakte für Ihr Team",
  description:
    "Ployo bündelt Personalakte, Schichtplanung, Urlaub und Krankheit, Zeiterfassung und Dateiablage für kleine und mittelständische Unternehmen.",
};

type T = Awaited<ReturnType<typeof getTranslations>>;

const container = "relative z-[1] mx-auto box-border max-w-[1200px] px-[clamp(16px,4vw,60px)]";
const sectionPadding = "py-[clamp(64px,9vw,120px)]";
const sectionTitle =
  "mt-4 font-display text-[clamp(32px,4.2vw,48px)] leading-[1.05] font-semibold tracking-[-1.4px]";
const monoLabel = "font-mono text-[10px] uppercase tracking-[0.03em] text-muted-2";

function SectionPill({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-[7px] font-mono text-[11px] uppercase tracking-[0.2em] ${
        dark
          ? "bg-white/[0.06] text-[#b5b5b0] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)]"
          : "pl-pill pl-glass text-muted-2"
      }`}
    >
      <span className={`size-1.5 rounded-full ${dark ? "pl-dot-light" : "pl-dot"}`} />
      {children}
    </span>
  );
}

function Rings({ variant }: { variant?: "app" | "sec" | "cta" }) {
  const extra = variant ? ` pl-ring-${variant}` : "";

  return (
    <div className="pl-rings" aria-hidden="true">
      <div className={`pl-ring${extra}`} />
      <div className={`pl-ring${extra} pl-ring-2`} />
      <div className={`pl-ring${extra} pl-ring-3`} />
    </div>
  );
}

function CheckItem({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 text-[15px] font-medium ${muted ? "text-muted-2" : "text-ink"}`}
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-[#7a3c9c] ${
          muted ? "bg-white/[0.62] shadow-[inset_0_0_0_1px_rgba(139,110,212,0.22)]" : "pl-icon-flat"
        }`}
      >
        {muted ? (
          <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <Check size={14} strokeWidth={2.5} aria-hidden="true" />
        )}
      </span>
      {children}
    </li>
  );
}

function FeatureHeading({
  icon: Icon,
  title,
  description,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      <span className="pl-icon flex size-9 items-center justify-center rounded-[9px] text-[#7a3c9c]">
        <Icon size={17} strokeWidth={2} aria-hidden="true" />
      </span>
      <h3 className="mt-1.5 font-display text-[22px] font-semibold tracking-[-0.5px] text-ink">
        {title}
      </h3>
      <p className="m-0 text-[14px] leading-[1.6] text-muted-2">{description}</p>
    </div>
  );
}

const mockPanel =
  "mt-auto flex flex-col rounded-xl border border-[rgba(228,227,223,0.8)] bg-[rgba(250,250,248,0.75)]";
const mockRow = "rounded-[10px] border border-border bg-white px-3 py-2.5";
const bentoCard = "pl-card pl-glass relative flex flex-col gap-6 overflow-hidden rounded-2xl p-8";

function StatusBadge({
  tone,
  dot = false,
  children,
}: {
  tone: "success" | "warning" | "danger";
  dot?: boolean;
  children: ReactNode;
}) {
  const toneClass = {
    success: "text-success bg-success/10 border-success/25",
    warning: "text-[#7a4e00] bg-warning/10 border-warning/25",
    danger: "text-danger bg-danger/10 border-danger/25",
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[7px] border px-2 py-[3px] text-[12px] font-medium whitespace-nowrap ${toneClass}`}
    >
      {dot && <span className="size-2 rounded-full bg-success" />}
      {children}
    </span>
  );
}

function BenefitsBento({ t }: { t: T }) {
  const shifts = [
    { time: "08:00 – 16:00", place: t("benefits.mock.branchCenter"), day: t("benefits.mock.mon"), border: "border-l-[#168a8a]" },
    { time: "12:00 – 20:00", place: t("benefits.mock.branchNorth"), day: t("benefits.mock.tue"), border: "border-l-[#2a6fdb]" },
    { time: t("benefits.mock.dayOffWish"), place: t("benefits.mock.allDay"), day: t("benefits.mock.wed"), border: "", striped: true },
    { time: "08:00 – 16:00", place: t("benefits.mock.branchCenter"), day: t("benefits.mock.thu"), border: "border-l-[#168a8a]" },
    { time: "10:00 – 18:00", place: t("benefits.mock.warehouse"), day: t("benefits.mock.fri"), border: "border-l-[#8b6ed4]" },
  ];
  const fields = [
    [t("benefits.mock.team"), t("benefits.mock.service")],
    [t("benefits.mock.entry"), "01.03.2024"],
    [t("benefits.mock.contract"), t("benefits.mock.fullTime")],
    [t("benefits.mock.vacation"), t("benefits.mock.vacationDays")],
  ];

  return (
    <div className="grid grid-cols-3 gap-4 max-[960px]:grid-cols-1">
      <article className={`${bentoCard} col-span-2 max-[960px]:col-span-1`}>
        <FeatureHeading
          icon={IdCard}
          title={t("benefits.personnelFile.title")}
          description={t("benefits.personnelFile.description")}
          className="[&_p]:max-w-[460px]"
        />
        <div aria-hidden="true" className={`${mockPanel} gap-3.5 p-4`}>
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#c9622a] font-display text-[15px] font-bold tracking-[-0.3px] text-white">
              DM
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="font-display text-[14.5px] font-semibold tracking-[-0.2px] text-ink">David Müller</span>
              <span className={monoLabel}>MA-0042 · {t("benefits.mock.branchCenter")}</span>
            </div>
            <StatusBadge tone="success" dot>
              {t("benefits.mock.active")}
            </StatusBadge>
          </div>
          <div className="grid grid-cols-4 gap-2 max-[560px]:grid-cols-2">
            {fields.map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1 rounded-[10px] border border-border bg-white px-3 py-2.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-2">{label}</span>
                <span className="text-[13.5px] text-ink">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </article>

      <article className={`${bentoCard} col-start-3 row-span-2 row-start-1 max-[960px]:col-start-auto max-[960px]:row-span-1 max-[960px]:row-start-auto`}>
        <FeatureHeading
          icon={Calendar}
          title={t("benefits.shifts.title")}
          description={t("benefits.shifts.description")}
        />
        <div aria-hidden="true" className={`${mockPanel} gap-2 p-3.5`}>
          <div className="flex items-center justify-between px-0.5 pt-0.5 pb-1.5">
            <span className="font-display text-[14.5px] font-semibold tracking-[-0.2px] text-ink">
              {t("benefits.mock.week")}
            </span>
            <StatusBadge tone="success">{t("benefits.mock.published")}</StatusBadge>
          </div>
          {shifts.map((shift) => (
            <div
              key={shift.day}
              className={`flex items-center justify-between gap-2 rounded-[10px] border border-border px-3 py-2.5 ${
                shift.striped ? "pl-stripe" : `border-l-[3px] bg-white ${shift.border}`
              }`}
            >
              <div className="flex flex-col gap-[3px]">
                <span className="text-[13.5px] font-medium text-ink">{shift.time}</span>
                <span className="text-[12px] text-muted-2">{shift.place}</span>
              </div>
              <span className={monoLabel}>{shift.day}</span>
            </div>
          ))}
        </div>
      </article>

      <article className={bentoCard}>
        <FeatureHeading
          icon={CalendarCheck}
          title={t("benefits.absences.title")}
          description={t("benefits.absences.description")}
        />
        <div aria-hidden="true" className={`${mockPanel} gap-1.5 p-2`}>
          <div className={`${mockRow} flex items-center justify-between gap-2`}>
            <div className="flex min-w-0 flex-col gap-[3px]">
              <span className="text-[13.5px] font-medium text-ink">Lara Albrecht</span>
              <span className="text-[12px] text-muted-2">22.11. – 26.11.2026</span>
            </div>
            <StatusBadge tone="warning">{t("benefits.mock.pending")}</StatusBadge>
          </div>
          <div className={`${mockRow} flex items-center justify-between gap-2`}>
            <div className="flex min-w-0 flex-col gap-[3px]">
              <span className="text-[13.5px] font-medium text-ink">David Müller</span>
              <span className="text-[12px] text-muted-2">{t("benefits.mock.since", { date: "24.10.2026" })}</span>
            </div>
            <StatusBadge tone="danger">{t("benefits.mock.absent")}</StatusBadge>
          </div>
        </div>
      </article>

      <article className={bentoCard}>
        <FeatureHeading
          icon={FileText}
          title={t("benefits.files.title")}
          description={t("benefits.files.description")}
        />
        <div aria-hidden="true" className={`${mockPanel} gap-1.5 p-2`}>
          {["Arbeitsvertrag.pdf", "Gehaltsabrechnung_10-2026.pdf"].map((fileName) => (
            <div key={fileName} className={`${mockRow} flex items-center gap-2.5`}>
              <File size={15} strokeWidth={2} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{fileName}</span>
              <span className={monoLabel}>PDF</span>
            </div>
          ))}
        </div>
      </article>

      <article className="pl-card pl-glass relative col-span-full flex flex-wrap items-center gap-x-12 gap-y-6 overflow-hidden rounded-2xl p-8">
        <FeatureHeading
          icon={Clock}
          title={t("benefits.timeTracking.title")}
          description={t("benefits.timeTracking.description")}
          className="flex-[1_1_320px] [&_p]:max-w-[440px]"
        />
        <div
          aria-hidden="true"
          className="flex flex-[1_1_440px] flex-wrap gap-2 rounded-xl border border-[rgba(228,227,223,0.8)] bg-[rgba(250,250,248,0.75)] p-3"
        >
          <div className="flex flex-[2_1_220px] items-center justify-between gap-3 rounded-[10px] border border-border bg-white px-4 py-3.5">
            <div className="flex flex-col gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-success">
                <span className="size-2 rounded-full bg-success" />
                {t("benefits.mock.clockedInSince", { time: "08:02" })}
              </span>
              <span className="font-display text-[30px] leading-none font-semibold tracking-[-1px] text-ink">04:12:36</span>
            </div>
            <span className="rounded-[9px] bg-ink px-3.5 py-[9px] text-[13px] font-semibold whitespace-nowrap text-white">
              {t("benefits.mock.clockOut")}
            </span>
          </div>
          <div className="flex flex-[1_1_150px] items-center gap-3 rounded-[10px] border border-border bg-white px-4 py-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[9px] bg-border-soft text-ink">
              <QrCode size={20} strokeWidth={2} />
            </span>
            <div className="flex flex-col gap-[3px]">
              <span className="text-[13.5px] font-medium text-ink">{t("benefits.mock.qrCode")}</span>
              <span className={monoLabel}>{t("benefits.mock.branchCenter")}</span>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

export default async function Home() {
  const t = await getTranslations("LandingPage");

  const securityCards = [
    { icon: Lock, key: "encryption" },
    { icon: Server, key: "hosting" },
    { icon: FileCheck, key: "processing" },
    { icon: KeyRound, key: "access" },
  ] as const;

  const roadmapSteps = [
    { icon: MessageCircle, key: "listen" },
    { icon: Code, key: "build" },
    { icon: ShieldCheck, key: "test" },
    { icon: Rocket, key: "ship" },
  ] as const;

  return (
    <LandingPointerEffects>
      <PageviewBeacon />
      <LandingHeader />

      {/* ─── Hero ─────────────────────────────── */}
      <div className="pl-hero relative overflow-hidden">
        <div className="pl-hero-grid" aria-hidden="true" />
        <div className="pl-hero-glow" aria-hidden="true" />
        <div className="pl-hero-grid pl-hero-spot" aria-hidden="true" />
        <Rings />
        <section
          aria-labelledby="hero-title"
          className={`${container} flex flex-col items-center pt-[clamp(136px,20vw,300px)] pb-[clamp(88px,15vw,240px)] text-center`}
        >
          <h1
            id="hero-title"
            className="m-0 max-w-[880px] font-display text-[clamp(40px,6vw,72px)] leading-[1.02] font-semibold tracking-[-2px] text-ink"
          >
            {t("hero.title")}
          </h1>
          <p className="mt-6 max-w-[620px] text-[clamp(16px,1.6vw,18px)] leading-[1.6] text-muted-2">
            {t("hero.subtitle")}
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-2">
            <span className="pl-cta-wrap relative inline-flex">
              <span className="pl-cta-glow" aria-hidden="true" />
              <Link
                href="/register"
                className="pl-cta pl-press pl-focus z-[1] inline-flex min-h-[52px] items-center gap-2.5 rounded-[10px] bg-ink px-6 py-3.5 text-[15px] font-semibold text-white"
              >
                <span className="pl-sheen" aria-hidden="true" />
                <span>{t("hero.primaryCta")}</span>
                <ArrowRight size={16} strokeWidth={2} className="pl-cta-arrow" aria-hidden="true" />
              </Link>
            </span>
            <a
              href="#vorteile"
              className="pl-more pl-press pl-focus inline-flex min-h-[52px] items-center gap-3 rounded-[10px] py-2 pr-[9px] pl-5 text-[15px] font-semibold text-ink backdrop-blur-[10px]"
            >
              {t("hero.secondaryCta")}
              <span className="pl-more-ico pl-more-ico-bob flex size-8 items-center justify-center rounded-lg">
                <ArrowDown size={15} strokeWidth={2} aria-hidden="true" />
              </span>
            </a>
          </div>
        </section>
      </div>

      {/* ─── Vorteile ─────────────────────────── */}
      <section
        id="vorteile"
        aria-labelledby="vorteile-title"
        className="relative scroll-mt-6 overflow-hidden"
      >
        <div className="pl-vglow" aria-hidden="true" />
        <div className={`${container} ${sectionPadding}`}>
          <div className="mb-[clamp(40px,5vw,56px)] flex flex-col items-center text-center">
            <SectionPill>{t("benefits.pill")}</SectionPill>
            <h2 id="vorteile-title" className={`${sectionTitle} max-w-[760px] text-ink`}>
              {t("benefits.title")}
            </h2>
            <p className="mt-[18px] max-w-[580px] text-[16px] leading-[1.6] text-muted-2">
              {t("benefits.subtitle")}
            </p>
          </div>
          <BenefitsBento t={t} />
        </div>
      </section>

      {/* ─── Mitarbeiter-App ──────────────────── */}
      <section id="app" aria-labelledby="app-title" className="relative overflow-hidden">
        <div className="pl-appglow" aria-hidden="true" />
        <div
          className={`${container} ${sectionPadding} grid grid-cols-2 items-center gap-[clamp(48px,6vw,96px)] max-[960px]:grid-cols-1`}
        >
          <div className="flex flex-col items-start">
            <SectionPill>{t("app.pill")}</SectionPill>
            <h2 id="app-title" className={`${sectionTitle} max-w-[520px] text-ink`}>
              {t("app.title")}
            </h2>
            <p className="mt-[18px] max-w-[480px] text-[16px] leading-[1.6] text-muted-2">
              {t("app.subtitle")}
            </p>
            <ul className="m-0 mt-8 flex list-none flex-col gap-3.5 p-0">
              {(["shifts", "requests", "clock", "documents", "push"] as const).map((point) => (
                <CheckItem key={point}>{t(`app.points.${point}`)}</CheckItem>
              ))}
              <CheckItem muted>{t("app.points.more")}</CheckItem>
            </ul>
          </div>

          <div className="relative flex justify-center py-6">
            <Rings variant="app" />
            <div className="pl-phone-halo" aria-hidden="true" />
            {/* `unoptimized`: Der Bild-Optimierer lädt die Quelle intern ohne
                `x-forwarded-proto` und landet in der HTTPS-Weiterleitung aus
                proxy.ts. Die PNGs sind ohnehin schon passend klein. */}
            <div className="pl-float relative w-full max-w-[330px]">
              <Image
                src="/landing/app-home.png"
                alt={t("app.imageAlt")}
                width={900}
                height={1734}
                unoptimized
                className="pl-phone block h-auto w-full"
              />
              <Image
                src="/landing/app-notification.png"
                alt=""
                width={972}
                height={594}
                unoptimized
                className="pl-float-2 pl-notif absolute h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Rollen & Berechtigungen ──────────── */}
      <section id="rollen" aria-labelledby="rollen-title" className="relative overflow-hidden">
        <div className="pl-rollglow" aria-hidden="true" />
        <div
          className={`${container} ${sectionPadding} grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] items-center gap-[clamp(48px,6vw,96px)] max-[960px]:grid-cols-1`}
        >
          <div className="max-[960px]:order-2">
            <RolePermissions />
          </div>
          <div className="flex flex-col items-start">
            <SectionPill>{t("roles.pill")}</SectionPill>
            <h2 id="rollen-title" className={`${sectionTitle} max-w-[520px] text-ink`}>
              {t("roles.title")}
            </h2>
            <p className="mt-[18px] max-w-[460px] text-[16px] leading-[1.6] text-muted-2">
              {t("roles.subtitle")}
            </p>
            <ul className="m-0 mt-8 flex list-none flex-col gap-3.5 p-0">
              {(["templates", "custom", "scope"] as const).map((point) => (
                <CheckItem key={point}>{t(`roles.points.${point}`)}</CheckItem>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ─── Sicherheit ───────────────────────── */}
      <div className="px-[clamp(8px,1.5vw,20px)] pb-[clamp(8px,1.5vw,20px)]">
        <section
          id="sicherheit"
          aria-labelledby="sicherheit-title"
          className="relative overflow-hidden rounded-2xl bg-[#0d0d0d] text-[#ededea]"
        >
          <div className="pl-secglow" aria-hidden="true" />
          <div className="pl-dark-grid pl-secgrid-bg" aria-hidden="true" />
          <div className={`${container} py-[clamp(72px,9vw,128px)]`}>
            <div className="mb-[clamp(40px,5vw,64px)] flex flex-col items-center text-center">
              <div className="relative mb-7 size-[76px]">
                <Rings variant="sec" />
                <div className="pl-emblem relative flex size-[76px] items-center justify-center rounded-2xl text-white">
                  <ShieldCheck size={32} strokeWidth={1.75} aria-hidden="true" />
                </div>
              </div>
              <SectionPill dark>{t("security.pill")}</SectionPill>
              <h2 id="sicherheit-title" className={`${sectionTitle} max-w-[720px] text-white`}>
                {t("security.title")}
              </h2>
              <p className="mt-[18px] max-w-[560px] text-[16px] leading-[1.6] text-[#a3a39e]">
                {t("security.subtitle")}
              </p>
            </div>

            <div className="grid grid-cols-4 gap-4 max-[1080px]:grid-cols-2 max-[600px]:grid-cols-1">
              {securityCards.map(({ icon: Icon, key }) => (
                <article
                  key={key}
                  className="pl-dcard relative flex flex-col gap-3 overflow-hidden rounded-2xl bg-white/[0.035] p-7"
                >
                  <span className="pl-dicon flex size-10 items-center justify-center rounded-[10px] text-[#c9b8f5]">
                    <Icon size={18} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <h3 className="mt-2 font-display text-[19px] font-semibold tracking-[-0.4px] text-white">
                    {t(`security.cards.${key}.title`)}
                  </h3>
                  <p className="m-0 text-[14px] leading-[1.6] text-[#a3a39e]">
                    {t(`security.cards.${key}.description`)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ─── Roadmap ──────────────────────────── */}
      <section id="roadmap" aria-labelledby="roadmap-title" className="relative overflow-hidden">
        <div className="pl-vglow" aria-hidden="true" />
        <div className={`${container} ${sectionPadding}`}>
          <div className="mb-[clamp(40px,5vw,56px)] flex flex-col items-center text-center">
            <SectionPill>{t("roadmap.pill")}</SectionPill>
            <h2 id="roadmap-title" className={`${sectionTitle} max-w-[720px] text-ink`}>
              {t("roadmap.title")}
            </h2>
            <p className="mt-[18px] max-w-[580px] text-[16px] leading-[1.6] text-muted-2">
              {t("roadmap.subtitle")}
            </p>
          </div>

          <div className="relative grid grid-cols-4 gap-4 max-[960px]:grid-cols-2 max-[960px]:gap-y-12 max-[520px]:grid-cols-1">
            <div className="pl-steps-line" aria-hidden="true">
              <span className="pl-steps-flow" />
            </div>
            {roadmapSteps.map(({ icon: Icon, key }, index) => {
              const last = index === roadmapSteps.length - 1;

              return (
                <div key={key} className="pl-step relative flex flex-col items-center text-center">
                  <span
                    className={`pl-step-num relative z-[1] flex size-14 items-center justify-center rounded-full ${
                      last ? "pl-step-last text-white" : "text-[#7a3c9c]"
                    }`}
                  >
                    <Icon size={20} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className="mt-5 font-mono text-[10.5px] uppercase tracking-[0.6px] text-muted-2">
                    {t("roadmap.step", { number: String(index + 1).padStart(2, "0") })}
                  </span>
                  <h3 className="mt-2 font-display text-[19px] font-semibold tracking-[-0.4px] text-ink">
                    {t(`roadmap.steps.${key}.title`)}
                  </h3>
                  <p className="mt-2 max-w-[240px] text-[14px] leading-[1.6] text-muted-2">
                    {t(`roadmap.steps.${key}.description`)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-[clamp(48px,6vw,72px)] flex flex-wrap items-center justify-center gap-x-4 gap-y-3 text-center">
            <span className="text-[15px] text-muted-2">{t("roadmap.missingFeature")}</span>
            <Link
              href="/kontakt"
              className="pl-more pl-press pl-focus inline-flex min-h-11 items-center gap-2.5 rounded-[10px] py-1.5 pr-[7px] pl-4 text-[14px] font-semibold text-ink backdrop-blur-[10px]"
            >
              {t("roadmap.suggestIdea")}
              <span className="pl-more-ico flex size-[30px] items-center justify-center rounded-lg">
                <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Preise ───────────────────────────── */}
      <section id="preise" aria-labelledby="preise-title" className="relative overflow-hidden">
        <div className="pl-priceglow" aria-hidden="true" />
        <div className={`${container} ${sectionPadding}`}>
          <div className="mb-8 flex flex-col items-center text-center">
            <SectionPill>{t("pricing.pill")}</SectionPill>
            <h2 id="preise-title" className={`${sectionTitle} max-w-[720px] text-ink`}>
              {t("pricing.title")}
            </h2>
            <p className="mt-[18px] max-w-[540px] text-[16px] leading-[1.6] text-muted-2">
              {t("pricing.subtitle")}
            </p>
          </div>
          <PricingPlans />
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────── */}
      <section id="faq" aria-labelledby="faq-title" className="relative overflow-hidden">
        <div className="pl-rollglow" aria-hidden="true" />
        <div
          className={`${container} ${sectionPadding} grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-[clamp(40px,6vw,96px)] max-[960px]:grid-cols-1`}
        >
          <div className="flex flex-col items-start min-[961px]:sticky min-[961px]:top-[120px]">
            <SectionPill>{t("faq.pill")}</SectionPill>
            <h2 id="faq-title" className={`${sectionTitle} text-ink`}>
              {t("faq.title")}
            </h2>
            <p className="mt-[18px] max-w-[380px] text-[16px] leading-[1.6] text-muted-2">
              {t("faq.subtitle")}
            </p>
            <Link
              href="/kontakt"
              className="pl-more pl-press pl-focus mt-7 inline-flex min-h-11 items-center gap-2.5 rounded-[10px] py-1.5 pr-[7px] pl-4 text-[14px] font-semibold text-ink backdrop-blur-[10px]"
            >
              {t("faq.contact")}
              <span className="pl-more-ico flex size-[30px] items-center justify-center rounded-lg">
                <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
              </span>
            </Link>
          </div>
          <LandingFaq />
        </div>
      </section>

      {/* ─── Abschluss-CTA ────────────────────── */}
      <div className="px-[clamp(8px,1.5vw,20px)] pb-[clamp(8px,1.5vw,20px)]">
        <section
          id="start"
          aria-labelledby="cta-title"
          className="pl-hero relative overflow-hidden rounded-2xl bg-[#0d0d0d] text-[#ededea]"
        >
          <div className="pl-ctaglow" aria-hidden="true" />
          <div className="pl-dark-grid pl-ctagrid" aria-hidden="true" />
          <div className="pl-ctaspot" aria-hidden="true" />
          <Rings variant="cta" />
          <div className="relative z-[1] mx-auto box-border flex max-w-[820px] flex-col items-center px-[clamp(16px,4vw,60px)] py-[clamp(80px,11vw,150px)] text-center">
            <Image
              src="/logo_square_white.svg"
              alt=""
              width={44}
              height={44}
              className="pl-cta-logo mb-7 block"
            />
            <h2
              id="cta-title"
              className="m-0 font-display text-[clamp(36px,5.4vw,64px)] leading-[1.02] font-semibold tracking-[-2px] text-white"
            >
              {t("cta.title")}
            </h2>
            <p className="mt-5 max-w-[520px] text-[clamp(16px,1.6vw,18px)] leading-[1.6] text-[#a3a39e]">
              {t("cta.subtitle")}
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-2.5">
              <Link
                href="/register"
                className="pl-cta-light pl-press pl-focus relative inline-flex min-h-[52px] items-center gap-2.5 overflow-hidden rounded-[10px] bg-white px-6 py-3.5 text-[15px] font-semibold text-ink"
              >
                <span className="pl-sheen pl-sheen-violet" aria-hidden="true" />
                <span className="relative">{t("cta.primary")}</span>
                <ArrowRight size={16} strokeWidth={2} className="pl-cta-arrow relative" aria-hidden="true" />
              </Link>
              <Link
                href="/kontakt"
                className="pl-glass-dark pl-press pl-focus inline-flex min-h-[52px] items-center gap-2.5 rounded-[10px] px-[22px] py-3.5 text-[15px] font-semibold text-white"
              >
                {t("cta.secondary")}
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13px] text-[#a3a39e]">
              {(["trial", "billing", "cancel"] as const).map((point) => (
                <span key={point} className="inline-flex items-center gap-2">
                  <Check size={14} strokeWidth={2.5} className="text-[#c9b8f5]" aria-hidden="true" />
                  {t(`cta.points.${point}`)}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ─── Footer ───────────────────────────── */}
      <footer className="relative overflow-hidden">
        <div className={`${container} pt-[clamp(56px,7vw,88px)] pb-8`}>
          <div className="grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] gap-10 max-[860px]:grid-cols-2">
            <div className="flex flex-col items-start gap-4 max-[860px]:col-span-full">
              <Link
                href="/"
                aria-label={t("header.homeAria")}
                className="pl-focus flex items-center gap-2 rounded-[9px] text-ink"
              >
                <Image src="/logo_square_brand.svg" alt="" width={22} height={22} />
                <span className="font-display text-[18px] leading-none font-semibold tracking-[-0.4px]">
                  Ployo
                </span>
              </Link>
              <p className="m-0 max-w-[300px] text-[14px] leading-[1.6] text-muted-2">
                {t("footer.tagline")}
              </p>
              <a
                href="mailto:info@ployo.io"
                className="pl-flink pl-focus inline-flex items-center gap-2 rounded-md text-[14px] font-medium text-ink"
              >
                <Mail size={15} strokeWidth={2} className="text-[#7a3c9c]" aria-hidden="true" />
                info@ployo.io
              </a>
            </div>

            <nav aria-label={t("footer.product")} className="flex flex-col gap-3">
              <span className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.6px] text-muted-2">
                {t("footer.product")}
              </span>
              {(
                [
                  ["#vorteile", "benefits"],
                  ["#app", "app"],
                  ["#rollen", "roles"],
                  ["#sicherheit", "security"],
                  ["#preise", "plans"],
                ] as const
              ).map(([href, key]) => (
                <a key={key} href={href} className="pl-flink pl-focus rounded-md text-[14px] text-muted-2">
                  {t(`footer.links.${key}`)}
                </a>
              ))}
            </nav>

            <nav aria-label={t("footer.company")} className="flex flex-col gap-3">
              <span className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.6px] text-muted-2">
                {t("footer.company")}
              </span>
              <Link href="/kontakt" className="pl-flink pl-focus rounded-md text-[14px] text-muted-2">
                {t("footer.links.contact")}
              </Link>
              <a href="#faq" className="pl-flink pl-focus rounded-md text-[14px] text-muted-2">
                {t("footer.links.faq")}
              </a>
              <Link href="/login" className="pl-flink pl-focus rounded-md text-[14px] text-muted-2">
                {t("footer.links.login")}
              </Link>
            </nav>

            <nav aria-label={t("footer.legal")} className="flex flex-col gap-3">
              <span className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.6px] text-muted-2">
                {t("footer.legal")}
              </span>
              <Link href="/impressum" className="pl-flink pl-focus rounded-md text-[14px] text-muted-2">
                {t("footer.links.imprint")}
              </Link>
              <Link href="/datenschutz" className="pl-flink pl-focus rounded-md text-[14px] text-muted-2">
                {t("footer.links.privacy")}
              </Link>
              <Link href="/agb" className="pl-flink pl-focus rounded-md text-[14px] text-muted-2">
                {t("footer.links.terms")}
              </Link>
              {/* CookieSettingsLink erbt die Schrift (`font: inherit`), daher die Größe am Wrapper. */}
              <span className="text-[14px] text-muted-2">
                <CookieSettingsLink className="pl-flink pl-focus rounded-md text-left" />
              </span>
              <Link href="/konto-loeschung" className="pl-flink pl-focus rounded-md text-[14px] text-muted-2">
                {t("footer.links.deleteAccount")}
              </Link>
            </nav>
          </div>

          <div className="mt-[clamp(48px,6vw,72px)] flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-ink/[0.06] pt-6">
            <span className="text-[13px] text-muted-2">
              {t("footer.copyright", { year: new Date().getFullYear() })}
            </span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-2">
              <LocaleSwitcher />
              <span className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-[#8b6ed4] shadow-[0_0_8px_rgba(139,110,212,0.8)]" />
                {t("footer.madeIn")}
              </span>
            </div>
          </div>
        </div>

        <div className="pl-foot-word" aria-hidden="true">
          Ployo
        </div>
      </footer>
    </LandingPointerEffects>
  );
}
