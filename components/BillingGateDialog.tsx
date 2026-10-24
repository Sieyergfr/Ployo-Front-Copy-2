"use client";

import {
  payOpenInvoiceAction,
  startGateCheckoutAction,
} from "@/app/(dashboard)/u/[tenant]/abo-erforderlich/actions";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useActionStateWithToast } from "@/components/Toasts";
import type { BillingBlockReason } from "@/lib/billing-access";
import { CreditCard, Loader2, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
};

export default function BillingGateDialog({
  tenant,
  tenantName,
  reason,
  canManage,
  awaitingConfirmation,
}: BillingGateDialogProps) {
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
      <div className="w-full max-w-[440px] rounded-[18px] border border-border bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
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
            <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-[#F4F3EF] text-ink">
              <Lock size={20} />
            </div>
            <h1 id="billing-gate-title" className="m-0 font-display text-[20px] font-semibold tracking-[-0.4px] text-ink">
              {copy.title}
            </h1>
            <p className="mt-2 mb-0 text-[13.5px] leading-[1.6] text-muted-2">{copy.body}</p>

            {awaitingConfirmation && (
              <p className="mt-3 mb-0 rounded-[10px] border border-border bg-bg px-3 py-2 text-[12.5px] leading-5 text-muted-2">
                {t("confirmationTimeout")}
              </p>
            )}

            {canManage ? (
              <form
                className="mt-5"
                action={reason === "payment_failed" ? invoiceAction : checkoutAction}
              >
                <input type="hidden" name="tenant" value={tenant} />
                <FormSubmitButton
                  className="btn btn-primary w-full justify-center"
                  Icon={CreditCard}
                  pendingLabel={t("redirecting")}
                >
                  {reason === "setup_required"
                    ? t("setupAction")
                    : reason === "payment_failed"
                      ? t("paymentFailedAction")
                      : t("inactiveAction")}
                </FormSubmitButton>
              </form>
            ) : (
              <p className="mt-4 mb-0 rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[12.5px] leading-5 text-muted-2">
                {t("contactManager")}
              </p>
            )}

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-border-soft pt-4 text-[12.5px]">
              <Link href="/select" className="text-muted no-underline transition-colors hover:text-ink">
                {t("switchCompany")}
              </Link>
              <Link href="/logout" className="text-muted no-underline transition-colors hover:text-ink">
                {t("logout")}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
