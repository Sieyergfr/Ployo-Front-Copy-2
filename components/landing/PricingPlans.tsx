"use client";

import { ArrowRight, Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

type Billing = "monthly" | "yearly";

// Monatspreise in Euro; jährlich abgerechnet gibt es 20 % Rabatt.
const plans = [
  { id: "starter", monthly: 29, featured: false },
  { id: "professional", monthly: 59, featured: true },
  { id: "business", monthly: 99, featured: false },
] as const;

const YEARLY_DISCOUNT = 0.2;

const includedFeatures = [
  "personnelFile",
  "shiftPlanning",
  "vacationSickness",
  "timeTracking",
  "files",
  "app",
  "roles",
] as const;

export default function PricingPlans() {
  const t = useTranslations("LandingPage.pricing");
  const [billing, setBilling] = useState<Billing>("monthly");
  const yearly = billing === "yearly";
  const locale = useLocale();
  const euroExact = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Glatte Preise ohne Nachkommastellen ("29 €"), sonst immer zwei ("23,20 €").
  const formatPrice = (value: number) =>
    Number.isInteger(value) ? String(value) : euroExact.format(value);

  return (
    <>
      <div className="mb-[clamp(36px,4vw,52px)] flex justify-center">
        <div
          role="radiogroup"
          aria-label={t("billingLabel")}
          className="pl-pill pl-glass inline-flex gap-0.5 rounded-xl p-1"
        >
          {(["monthly", "yearly"] as const).map((option) => {
            const active = billing === option;

            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setBilling(option)}
                className={`pl-focus inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[9px] border-0 py-[9px] text-[13.5px] ${
                  option === "yearly" ? "pr-3.5 pl-[18px]" : "px-[18px]"
                } ${
                  active
                    ? "pl-toggle-active bg-ink font-semibold text-white"
                    : "pl-tab bg-transparent font-medium text-muted-2"
                }`}
              >
                {t(option)}
                {option === "yearly" && (
                  <span
                    className={`rounded-md px-[7px] py-0.5 text-[11.5px] font-semibold ${
                      active ? "bg-[rgba(167,142,232,0.25)] text-[#e2d8fb]" : "bg-[rgba(139,110,212,0.12)] text-[#7a3c9c]"
                    }`}
                  >
                    −20 %
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 items-stretch gap-4 max-[960px]:[&_article]:p-6 max-[760px]:mx-auto max-[760px]:max-w-[480px] max-[760px]:grid-cols-1 max-[760px]:[&_article]:p-8">
        {plans.map((plan) => {
          const monthlyPrice = yearly ? plan.monthly * (1 - YEARLY_DISCOUNT) : plan.monthly;
          const note = yearly
            ? t("billedYearlyAmount", { amount: euroExact.format(monthlyPrice * 12) })
            : t("billedMonthly");
          const dark = plan.featured;

          return (
            <article
              key={plan.id}
              className={`relative flex flex-col overflow-hidden rounded-2xl p-8 ${
                dark ? "pl-dcard pl-featured bg-[#0d0d0d] text-[#ededea]" : "pl-card pl-glass"
              }`}
            >
              {dark && <div className="pl-featured-glow" aria-hidden="true" />}
              <div className="flex items-center justify-between gap-3">
                <h3
                  className={`m-0 font-display text-[22px] font-semibold tracking-[-0.5px] ${dark ? "text-white" : "text-ink"}`}
                >
                  {t(`${plan.id}.name`)}
                </h3>
                {dark && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(167,142,232,0.16)] px-2.5 py-1 text-[12px] font-semibold text-[#e2d8fb] shadow-[inset_0_0_0_1px_rgba(167,142,232,0.35)]">
                    <span className="size-1.5 rounded-full bg-[#a78ee8] shadow-[0_0_8px_rgba(167,142,232,0.9)]" />
                    {t("recommended")}
                  </span>
                )}
              </div>
              <p className={`mt-2 text-[14px] leading-[1.6] ${dark ? "text-[#a3a39e]" : "text-muted-2"}`}>
                {t(`${plan.id}.description`)}
              </p>
              <div className="mt-6 flex items-baseline gap-1.5">
                <span
                  className={`font-display text-[42px] leading-none font-semibold tracking-[-1.5px] ${dark ? "text-white" : "text-ink"}`}
                >
                  {formatPrice(monthlyPrice)} €
                </span>
                <span className={`text-[14px] ${dark ? "text-[#a3a39e]" : "text-muted-2"}`}>
                  {t("perMonth")}
                </span>
              </div>
              <span className={`mt-2 text-[12.5px] ${dark ? "text-[#a3a39e]" : "text-muted-2"}`}>
                {t("plusVat")} · {note}
              </span>
              <Link
                href="/register"
                className={`pl-press pl-focus mt-6 flex min-h-12 items-center justify-center rounded-[10px] px-[18px] py-3 text-[14px] font-semibold ${
                  dark
                    ? "pl-cta border-[rgba(167,142,232,0.55)] bg-[#1a1a1a] text-white"
                    : "pl-more text-ink"
                }`}
              >
                {dark && <span className="pl-sheen" aria-hidden="true" />}
                <span>{t("startTrial")}</span>
              </Link>
              <div className={`mt-7 mb-5 h-px ${dark ? "bg-white/[0.08]" : "bg-ink/[0.06]"}`} />
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {(["limit", "allFeatures", "lastPoint"] as const).map((point, index) => (
                  <li
                    key={point}
                    className={`flex items-start gap-2.5 text-[14px] leading-[1.45] ${dark ? "text-[#ededea]" : "text-ink"}`}
                  >
                    <Check
                      size={16}
                      strokeWidth={2.5}
                      className={`mt-px shrink-0 ${dark ? "text-[#c9b8f5]" : "text-[#8b6ed4]"}`}
                      aria-hidden="true"
                    />
                    {index === 0 ? (
                      <strong className={`font-semibold ${dark ? "text-white" : ""}`}>
                        {t(`${plan.id}.${point}`)}
                      </strong>
                    ) : (
                      t(`${plan.id}.${point}`)
                    )}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      <div className="pl-card pl-glass relative mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 overflow-hidden rounded-2xl px-7 py-6">
        <div className="flex min-w-0 flex-col gap-3">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.6px] text-muted-2">
            {t("includedTitle")}
          </span>
          <div className="flex flex-wrap gap-2">
            {includedFeatures.map((feature) => (
              <span key={feature} className="pl-chip">
                {t(`included.${feature}`)}
              </span>
            ))}
          </div>
        </div>
        <Link
          href="/kontakt"
          className="pl-more pl-press pl-focus inline-flex min-h-11 items-center gap-2.5 rounded-[10px] py-1.5 pr-[7px] pl-4 text-[14px] font-semibold text-ink"
        >
          {t("moreEmployees")}
          <span className="pl-more-ico flex size-[30px] items-center justify-center rounded-lg">
            <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
          </span>
        </Link>
      </div>
    </>
  );
}
