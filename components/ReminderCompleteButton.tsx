"use client";

import { completeReminderAction } from "@/app/(dashboard)/u/[tenant]/erinnerungen/actions";
import { useActionStateWithToast } from "@/components/Toasts";
import type { Reminder } from "@/lib/reminders";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

export default function ReminderCompleteButton({
  reminder,
  tenant,
  returnPath,
  canDelete,
}: {
  reminder: Reminder;
  tenant: string;
  returnPath: string;
  canDelete: boolean;
}) {
  const t = useTranslations("RemindersPage");
  const [, formAction] = useActionStateWithToast(completeReminderAction);

  if (!canDelete) {
    return null;
  }

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <input type="hidden" name="reminderId" value={reminder.id} />
      <button
        type="submit"
        title={t("markDoneTitle")}
        aria-label={t("markDoneAria", { title: reminder.title })}
        className="flex size-[34px] cursor-pointer items-center justify-center rounded-[9px] border border-border bg-white text-muted transition-colors hover:border-success/30 hover:text-success"
      >
        <Check size={14} strokeWidth={2} />
      </button>
    </form>
  );
}
