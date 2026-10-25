"use client";

import {
  inviteEmployeeAction,
  setEmployeeAccessLockAction,
} from "@/app/(dashboard)/u/[tenant]/employees/actions";
import { DbField, DbModal, dbInputClass } from "@/components/dashboard/DbDrawer";
import { useActionStateWithToast, useToast } from "@/components/Toasts";
import { Lock, LockOpen, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** "In App einladen" außerhalb des Bearbeiten-Formulars (eigenes Formular). */
export function InviteToAppButton({
  tenant,
  employeeHandle,
  label,
  className,
}: {
  tenant: string;
  employeeHandle: string;
  label: string;
  className?: string;
}) {
  const [, formAction, isPending] = useActionStateWithToast(inviteEmployeeAction);

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="employeeHandle" value={employeeHandle} />
      <button type="submit" disabled={isPending} className={className}>
        <Send size={14} />
        <span>{label}</span>
      </button>
    </form>
  );
}

/** App-Zugang sperren (mit Grund) bzw. wieder freigeben — M2. */
export function AccessLockButton({
  tenant,
  employeeId,
  employeeHandle,
  employeeName,
  locked,
  className,
  onDone,
}: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
  employeeName: string;
  locked: boolean;
  className?: string;
  onDone?: () => void;
}) {
  const t = useTranslations("EmployeesUi.access");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [, formAction, isPending] = useActionStateWithToast(
    async (previous: Awaited<ReturnType<typeof setEmployeeAccessLockAction>>, formData: FormData) => {
      const result = await setEmployeeAccessLockAction(previous, formData);

      if (result.success) {
        setOpen(false);
        toast({ tone: "success", title: locked ? t("lockedToast") : t("unlockedToast") });
        onDone?.();
      }

      return result;
    },
  );

  const hidden = (
    <>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="employeeHandle" value={employeeHandle} />
    </>
  );

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {locked ? <LockOpen size={14} /> : <Lock size={14} />}
        <span>{locked ? t("unlock") : t("lock")}</span>
      </button>
      {/* Dialog per Portal: der Knopf sitzt in der Akte innerhalb des Bearbeiten-Formulars. */}
      {open && (
        <DbModal
          title={locked ? t("unlockTitle", { name: employeeName }) : t("lockTitle", { name: employeeName })}
          subtitle={locked ? t("unlockSubtitle") : t("lockSubtitle")}
          onClose={() => setOpen(false)}
        >
          <form action={formAction} className="flex flex-col gap-4">
            {hidden}
            <input type="hidden" name="locked" value={locked ? "0" : "1"} />
            {!locked && (
              <DbField label={t("reason")}>
                <input name="reason" maxLength={300} className={dbInputClass} placeholder={t("reasonPlaceholder")} />
              </DbField>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="db-btn2 db-focus min-h-11 cursor-pointer rounded-[10px] border border-[#ecebe7] bg-[#f2f1ed] px-4 text-[14px] font-semibold"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                disabled={isPending}
                className={`db-focus min-h-11 cursor-pointer rounded-[10px] border px-4 text-[14px] font-semibold text-white disabled:opacity-60 ${locked ? "border-ink bg-ink" : "border-[#b4332a] bg-[#b4332a]"}`}
              >
                {locked ? t("confirmUnlock") : t("confirmLock")}
              </button>
            </div>
          </form>
        </DbModal>
      )}
    </>
  );
}
