"use client";

import { disableTwoFactorRequirementAction } from "@/app/(dashboard)/u/[tenant]/zwei-faktor-erforderlich/actions";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useActionStateWithToast } from "@/components/Toasts";
import { useTranslations } from "next-intl";

export default function DisableTwoFactorRequirementForm({ tenant }: { tenant: string }) {
  const t = useTranslations("TwoFactorRequiredPage");
  const [, action] = useActionStateWithToast(disableTwoFactorRequirementAction);

  return (
    <form
      action={action}
      className="w-full rounded-card border border-border px-4 py-4 text-left"
    >
      <input type="hidden" name="tenant" value={tenant} />
      <p className="text-[13px] font-semibold text-ink">{t("ownerDisableTitle")}</p>
      <p className="mt-1 text-[12.5px] leading-[1.6] text-muted">{t("ownerDisableBody")}</p>
      <FormSubmitButton
        className="btn btn-secondary mt-3"
        pendingLabel={t("ownerDisablePending")}
      >
        {t("ownerDisableButton")}
      </FormSubmitButton>
    </form>
  );
}
