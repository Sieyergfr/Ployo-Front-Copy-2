"use client";

import {
  payOpenInvoiceAction,
  startGateCheckoutAction,
} from "@/app/(dashboard)/u/[tenant]/abo-erforderlich/actions";
import { getPlans, type Plan } from "@/components/CompanyCreate/CompanyCreateWizard";
import { ctaClass } from "@/components/dashboard/ui";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useActionStateWithToast } from "@/components/Toasts";
import type { BillingBlockReason } from "@/lib/billing-access";
import { Check, CreditCard, Loader2, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type PlanId = Plan["id"];

// Nach dem Checkout kommt der Stripe-Webhook meist binnen Sekunden — so lange
// neu laden, bis die Seite selbst ins Dashboard weiterleitet.
const CONFIRMATION_POLL_MS = 3000;
const CONFIRMATION_MAX_POLLS = 20;

type BillingGateDialogProps = {
  tenant: string;
  tenantName: string;
  reason: BillingBlockReason;
  canManage: boolean;
  awaitingConfirmation: boolean;
  /** Aktive Mitarbeitende (für den Hinweis "zu klein"). */
  employeeCount?: number;
  /** Maximale Mitarbeiterzahl je Plan (lib/stripe/plans.ts). */
  planLimits?: Record<string, number>;
  currentPlan?: string;
  currentCycle?: string;
};

export default function BillingGateDialog({
  tenant,
  tenantName,
  reason,
  canManage,
  awaitingConfirmation,
  employeeCount = 0,
  planLimits = {},
  currentPlan = "professional",
  currentCycle = "monthly",
}: BillingGateDialogProps) {
  const tPlans = useTranslations("CompanyCreateWizard");
  const plans = getPlans(tPlans);
  const showPlans = canManage && reason !== "payment_failed";
  const [plan, setPlan] = useState<PlanId>(() => {
    const fitting = plans.filter((item) => employeeCount <= (planLimits[item.id] ?? Infinity));

    return (fitting.find((item) => item.id === currentPlan) ?? fitting[0] ?? plans[plans.length - 1]).id;
  });
  const [cycle, setCycle] = useState<"monthly" | "yearly">(currentCycle === "yearly" ? "yearly" : "monthly");
  const selectedPlan = plans.find((item) => item.id === plan);
  const monthly = (item: Plan) => (cycle === "yearly" ? item.monthlyPrice * 0.8 : item.monthlyPrice);
  const euro = (value: number) =>
    new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const t = useTranslations("BillingGateDialog");
  const router = useRouter();
  const [polls, setPolls] = useState(0);
  const [, checkoutAction] = useActionStateWithToast(startGateCheckoutAction);
  const [, invoiceAction] = useActionStateWithToast(payOpenInvoiceAction);
  const confirming = awaitingConfirmation && polls < CONFIRMATION_MAX_POLLS;

  useEffect(() => {
    if (!confirming) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPolls((current) => current + 1);
      router.refresh();
    }, CONFIRMATION_POLL_MS);

    return () => window.clearTimeout(timeout);
  }, [confirming, polls, router]);

  const copy = {
    setup_required: { title: t("setupTitle"), body: t("setupBody", { company: tenantName }) },
    payment_failed: { title: t("paymentFailedTitle"), body: t("paymentFailedBody", { company: tenantName }) },
    subscription_inactive: { title: t("inactiveTitle"), body: t("inactiveBody", { company: tenantName }) },
  }[reason];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="billing-gate-title"
    >
      <div
        className={`max-h-[calc(100%-24px)] w-full overflow-y-auto rounded-[18px] border border-[#ecebe7] bg-white p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22),0_20px_50px_-20px_rgba(139,110,212,0.5)] ${
          showPlans ? "max-w-[800px]" : "max-w-[460px]"
        }`}
      >
        {confirming ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 size={28} className="animate-spin text-muted" />
            <h1 id="billing-gate-title" className="m-0 font-display text-[19px] font-semibold text-ink">
              {t("confirmingTitle")}
            </h1>
            <p className="m-0 text-[13.5px] leading-[1.6] text-muted">{t("confirmingBody")}</p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3.5">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-[13px] bg-ink text-[#c9b8f5] shadow-[0_10px_30px_rgba(139,110,212,0.35)]">
                <Lock size={20} />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-mono text-[10.5px] tracking-[0.12em] text-[#6e6e6b] uppercase">{t(`eyebrow.${reason}`)}</span>
                <h1 id="billing-gate-title" className="m-0 font-display text-[22px] font-semibold tracking-[-0.5px] text-ink">
                  {showPlans ? t("choosePlanTitle") : copy.title}
                </h1>
                <p className="m-0 text-[14px] leading-[1.55] text-[#6e6e6b]">{copy.body}</p>
              </div>
            </div>

            {awaitingConfirmation && (
              <p className="mt-3 mb-0 rounded-[10px] border border-border bg-bg px-3 py-2 text-[12.5px] leading-5 text-muted-2">
                {t("confirmationTimeout")}
              </p>
            )}

            {canManage ? (
              <form className="mt-5 flex flex-col gap-4" action={reason === "payment_failed" ? invoiceAction : checkoutAction}>
                <input type="hidden" name="tenant" value={tenant} />
                {showPlans && (
                  <>
                    <input type="hidden" name="plan" value={plan} />
                    <input type="hidden" name="billingCycle" value={cycle} />
                    <span role="radiogroup" aria-label={t("billingCycle")} className="flex gap-0.5 self-start rounded-[10px] bg-[#f2f1ed] p-[3px]">
                      {(["monthly", "yearly"] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={cycle === value}
                          onClick={() => setCycle(value)}
                          className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-[8px] border-0 px-3 text-[13px] ${
                            cycle === value ? "bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "bg-transparent font-medium text-[#6e6e6b]"
                          }`}
                        >
                          {t(value)}
                          {value === "yearly" && (
                            <span className="rounded-[5px] bg-[rgba(47,122,74,0.12)] px-1.5 text-[11px] font-semibold text-[#1f5d2c]">{t("yearlySaving")}</span>
                          )}
                        </button>
                      ))}
                    </span>
                    <div role="radiogroup" aria-label={t("choosePlanTitle")} className="grid gap-2.5 sm:grid-cols-3">
                      {plans.map((item) => {
                        const tooSmall = employeeCount > (planLimits[item.id] ?? Infinity);
                        const selected = plan === item.id;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={tooSmall}
                            onClick={() => setPlan(item.id)}
                            className={`flex cursor-pointer flex-col gap-1 rounded-[14px] border p-3.5 text-left disabled:cursor-default ${
                              selected ? "border-[#8b6ed4] bg-[rgba(139,111,224,0.06)] shadow-[0_0_0_3px_rgba(139,111,224,0.15)]" : "border-[#ecebe7] bg-white"
                            } ${tooSmall ? "opacity-60" : ""}`}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-[15px] font-semibold">{item.name}</span>
                              {item.recommended && (
                                <span className="rounded-[5px] bg-[rgba(139,111,224,0.14)] px-1.5 text-[11px] font-semibold text-[#6b4fc4]">{t("popular")}</span>
                              )}
                            </span>
                            <span className="font-display text-[24px] font-semibold tracking-[-0.6px]">
                              {euro(monthly(item))} €<span className="font-sans text-[13px] font-normal tracking-normal text-[#6e6e6b]"> / {t("month")}</span>
                            </span>
                            <span className="text-[13px] text-[#6e6e6b]">{item.included}</span>
                            {tooSmall && <span className="text-[12.5px] text-[#b4332a]">{t("tooSmall")}</span>}
                            <span className="mt-1 flex flex-col gap-1">
                              {item.features.slice(0, 3).map((feature) => (
                                <span key={feature} className="flex items-start gap-1.5 text-[12.5px] text-[#3d3d3a]">
                                  <Check size={13} className="mt-0.5 shrink-0 text-[#6b4fc4]" />
                                  {feature}
                                </span>
                              ))}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedPlan && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-ink px-4 py-3.5 text-white">
                        <span className="flex flex-col">
                          <span className="text-[14px] font-semibold">
                            {selectedPlan.name} · {euro(monthly(selectedPlan))} € / {t("month")}
                          </span>
                          <span className="text-[12.5px] text-white/70">{cycle === "yearly" ? t("yearlyNote") : t("monthlyNote")}</span>
                        </span>
                        <span className="flex flex-col items-end">
                          <span className="text-[11.5px] text-white/70">{reason === "setup_required" ? t("afterTrial") : t("dueToday")}</span>
                          <span className="font-display text-[22px] font-semibold">
                            {euro(cycle === "yearly" ? monthly(selectedPlan) * 12 : monthly(selectedPlan))} €
                          </span>
                        </span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[13px] text-[#6e6e6b]">
                    {t("questions")}{" "}
                    <a href="mailto:info@ployo.io" className="font-semibold text-ink">
                      info@ployo.io
                    </a>
                  </span>
                  <FormSubmitButton className={ctaClass} Icon={CreditCard} pendingLabel={t("redirecting")}>
                    {reason === "payment_failed" ? t("paymentFailedAction") : t("continueToStripe")}
                  </FormSubmitButton>
                </div>
              </form>
            ) : (
              <p className="mt-4 mb-0 rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[12.5px] leading-5 text-muted-2">
                {t("contactManager")}
              </p>
            )}

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#f0efeb] pt-4 text-[13px]">
              <Link href="/select" className="text-[#6e6e6b] no-underline transition-colors hover:text-ink">
                {t("switchCompany")}
              </Link>
              <Link href="/logout" className="text-[#6e6e6b] no-underline transition-colors hover:text-ink">
                {t("logout")}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
