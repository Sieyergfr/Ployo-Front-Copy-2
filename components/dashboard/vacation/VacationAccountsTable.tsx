"use client";

import {
  remindVacationCarryoverAction,
  type CarryoverReminderState,
} from "@/app/(dashboard)/u/[tenant]/urlaub/actions";
import { useToast } from "@/components/Toasts";
import { Bell, Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

export type VacationAccountRow = {
  id: string;
  name: string;
  initials: string;
  team: string;
  total: number;
  carryover: number;
  carryoverExpiresAt: string | null;
  carryoverRemindedAt: string | null;
  correction: number;
  taken: number;
  planned: number;
  remaining: number;
  hasAccount: boolean;
};

const initialState: CarryoverReminderState = {};

function RemindButton({ tenant, employeeIds, label, primary }: { tenant: string; employeeIds: string[]; label: string; primary?: boolean }) {
  const t = useTranslations("VacationUi.accounts");
  const { toast } = useToast();
  const [, formAction, isPending] = useActionState(async (previous: CarryoverReminderState, formData: FormData) => {
    const result = await remindVacationCarryoverAction(previous, formData);

    if (result.error) {
      toast({ tone: "error", title: result.error });
    } else {
      toast({
        tone: "success",
        title: t("sent", { count: result.delivered ?? 0 }),
        subtitle: result.withoutAccount ? t("withoutAccount", { count: result.withoutAccount }) : undefined,
      });
    }

    return result;
  }, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />
      {employeeIds.map((id) => (
        <input key={id} type="hidden" name="employeeId" value={id} />
      ))}
      <button
        type="submit"
        disabled={isPending || employeeIds.length === 0}
        className={
          primary
            ? "db-cta db-focus relative inline-flex min-h-10 cursor-pointer items-center gap-2 overflow-hidden rounded-[10px] border border-[rgba(167,142,232,0.45)] bg-ink px-4 text-[13.5px] font-semibold text-white disabled:cursor-default disabled:opacity-50"
            : "db-act db-focus inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-[8px] border border-[#ecebe7] bg-[#f2f1ed] px-2.5 text-[12.5px] font-medium disabled:opacity-50"
        }
      >
        <Bell size={13} />
        <span>{label}</span>
      </button>
    </form>
  );
}

export default function VacationAccountsTable({
  tenant,
  rows,
  canManage,
}: {
  tenant: string;
  rows: VacationAccountRow[];
  canManage: boolean;
}) {
  const t = useTranslations("VacationUi.accounts");
  const locale = useLocale();
  const date = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const notYetReminded = rows.filter((row) => row.carryover > 0 && !row.carryoverRemindedAt && row.hasAccount);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <span className="text-[13px] text-[#6e6e6b]">{t("hint")}</span>
        {canManage && (
          <RemindButton
            tenant={tenant}
            employeeIds={notYetReminded.map((row) => row.id)}
            label={t("remindAll", { count: notYetReminded.length })}
            primary
          />
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-t border-[#ecebe7] font-mono text-[10px] tracking-[0.1em] text-[#6e6e6b] uppercase">
              {["employee", "entitlement", "carryover", "correction", "taken", "planned", "remaining"].map((column) => (
                <th key={column} className="px-5 py-3 font-normal">
                  {t(`columns.${column}`)}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[#f0efeb]">
                <td className="px-5 py-3">
                  <span className="flex flex-col">
                    <span className="text-[14px] font-semibold">{row.name}</span>
                    <span className="text-[12.5px] text-[#6e6e6b]">{row.team}</span>
                  </span>
                </td>
                <td className="px-5 py-3 text-[14px]">{row.total}</td>
                <td className="px-5 py-3 text-[14px]">
                  {row.carryover > 0 ? (
                    <span className="flex flex-col">
                      <span className="font-semibold">+{row.carryover}</span>
                      <span className="text-[11.5px] text-[#9a5b00]">
                        {t("expires", { date: row.carryoverExpiresAt ? date.format(new Date(`${row.carryoverExpiresAt}T12:00:00Z`)) : "31.03." })}
                      </span>
                    </span>
                  ) : (
                    "–"
                  )}
                </td>
                <td className="px-5 py-3 text-[14px]">{row.correction ? (row.correction > 0 ? `+${row.correction}` : row.correction) : "–"}</td>
                <td className="px-5 py-3 text-[14px]">{row.taken}</td>
                <td className="px-5 py-3 text-[14px]">{row.planned || "–"}</td>
                <td className="px-5 py-3">
                  <span className="flex items-center gap-2.5">
                    <strong className="w-7 text-[14px]">{row.remaining}</strong>
                    <span className="block h-1.5 w-20 overflow-hidden rounded-full bg-[#f2f1ed]">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (row.remaining / Math.max(1, row.total + row.carryover)) * 100)}%`,
                          background: row.carryover > 0 ? "#e07b00" : "#8b6ed4",
                        }}
                      />
                    </span>
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  {row.carryover > 0 &&
                    (row.carryoverRemindedAt ? (
                      <span className="inline-flex items-center gap-1 text-[12px] text-[#357a52]">
                        <Check size={13} />
                        {t("reminded", { date: date.format(new Date(row.carryoverRemindedAt)) })}
                      </span>
                    ) : canManage && row.hasAccount ? (
                      <RemindButton tenant={tenant} employeeIds={[row.id]} label={t("remind")} />
                    ) : (
                      <span className="text-[12px] text-[#9a9a96]">{row.hasAccount ? "" : t("noAccount")}</span>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
