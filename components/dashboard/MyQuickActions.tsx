"use client";

import { DbDrawer, DbField, dbInputClass } from "@/components/dashboard/DbDrawer";
import { DbCtaButton } from "@/components/dashboard/ui";
import { useToast } from "@/components/Toasts";
import { EMPLOYEE_DOCUMENT_SLOTS } from "@/lib/employees";
import { CalendarHeart, History, Sun, Thermometer, Upload, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

type QuickAction = "vacation" | "sickness" | "wishFree" | "correction" | "document";

/** Ruft eine der `/api/me/*`-Routen auf (dieselben wie die App) und liefert die Fehlermeldung, falls es eine gibt. */
async function callApi(url: string, init: RequestInit): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, init);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return { ok: false, error: (data as { error?: string } | null)?.error ?? "" };
    }

    return { ok: true, data };
  } catch {
    return { ok: false, error: "" };
  }
}

function postJson(url: string, body: unknown) {
  return callApi(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function uploadMyDocumentFile(input: {
  tenant: string;
  file: File;
  documentType?: string;
  slot?: string;
  description?: string;
}) {
  const form = new FormData();

  form.set("tenant", input.tenant);
  form.set("file", input.file);
  form.set("documentType", input.documentType ?? "Sonstiges");

  if (input.slot) form.set("slot", input.slot);
  if (input.description) form.set("description", input.description);

  return callApi("/api/me/documents", { method: "POST", body: form });
}

/** Gemeinsamer Rahmen der Schnellaktions-Formulare: Absenden, Fehler, Erfolg. */
function useSubmit(onDone: () => void) {
  const t = useTranslations("MyArea.quick");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  return {
    pending,
    async submit(run: () => Promise<{ ok: boolean; error?: string }>, successTitle: string) {
      setPending(true);
      const result = await run();
      setPending(false);

      if (!result.ok) {
        toast({ tone: "error", title: result.error || t("genericError") });
        return;
      }

      toast({ tone: "success", title: successTitle });
      onDone();
      router.refresh();
    },
  };
}

function SubmitRow({ pending, label }: { pending: boolean; label: string }) {
  return (
    <DbCtaButton type="submit" disabled={pending} className="w-full">
      <span>{label}</span>
    </DbCtaButton>
  );
}

function todayIso() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function TimeCorrectionForm({
  tenant,
  defaults,
  onDone,
}: {
  tenant: string;
  defaults?: { date?: string; startTime?: string; endTime?: string };
  onDone: () => void;
}) {
  const t = useTranslations("MyArea.quick");
  const { pending, submit } = useSubmit(onDone);
  const [startTime, setStartTime] = useState(defaults?.startTime ?? "");
  const [endTime, setEndTime] = useState(defaults?.endTime ?? "");
  const [breakMinutes, setBreakMinutes] = useState("");
  const span = (() => {
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return null;

    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    let minutes = eh * 60 + em - (sh * 60 + sm);

    if (minutes <= 0) minutes += 24 * 60;

    // Ohne eigene Angabe: gesetzliche Mindestpause (§4 ArbZG).
    const pause = breakMinutes ? Number(breakMinutes) : minutes > 9 * 60 ? 45 : minutes > 6 * 60 ? 30 : 0;

    return { net: Math.max(0, minutes - pause), pause };
  })();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    void submit(
      () =>
        postJson("/api/me/time-corrections", {
          tenant,
          date: form.get("date"),
          startTime,
          endTime,
          breakMinutes: breakMinutes ? Number(breakMinutes) : null,
          reason: form.get("reason"),
        }),
      t("correctionSent"),
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <DbField label={t("date")}>
        <input name="date" type="date" required max={todayIso()} defaultValue={defaults?.date ?? todayIso()} className={dbInputClass} />
      </DbField>
      <div className="grid grid-cols-2 gap-3">
        <DbField label={t("clockIn")}>
          <input type="time" required value={startTime} onChange={(event) => setStartTime(event.target.value)} className={dbInputClass} />
        </DbField>
        <DbField label={t("clockOut")}>
          <input type="time" required value={endTime} onChange={(event) => setEndTime(event.target.value)} className={dbInputClass} />
        </DbField>
      </div>
      <DbField label={t("breakMinutes")} hint={t("breakHint")}>
        <input
          type="number"
          min={0}
          max={600}
          inputMode="numeric"
          value={breakMinutes}
          onChange={(event) => setBreakMinutes(event.target.value)}
          className={dbInputClass}
        />
      </DbField>
      <DbField label={t("reasonOptional")}>
        <input name="reason" maxLength={500} placeholder={t("correctionPlaceholder")} className={dbInputClass} />
      </DbField>
      {span && (
        <div className="flex items-baseline justify-between gap-3 border-t border-[#ecebe7] pt-3">
          <span className="flex flex-col">
            <span className="text-[13px] text-[#6e6e6b]">{t("newWorkingTime")}</span>
            <span className="text-[11.5px] text-[#9a9a96]">{t("lessBreak", { minutes: span.pause })}</span>
          </span>
          <span className="font-display text-[22px] font-semibold tracking-[-0.5px]">
            {Math.floor(span.net / 60)}:{String(span.net % 60).padStart(2, "0")} {t("hoursShort")}
          </span>
        </div>
      )}
      <SubmitRow pending={pending} label={t("requestCorrection")} />
    </form>
  );
}

function VacationForm({ tenant, remaining, onDone }: { tenant: string; remaining: number; onDone: () => void }) {
  const t = useTranslations("MyArea.quick");
  const { pending, submit } = useSubmit(onDone);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    void submit(
      () =>
        postJson("/api/me/vacation-requests", {
          tenant,
          startDate: form.get("startDate"),
          endDate: form.get("endDate"),
          note: form.get("note"),
        }),
      t("vacationSent"),
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <p className="m-0 rounded-[12px] bg-[rgba(139,110,212,0.08)] px-3 py-2.5 text-[13px] text-[#4f3a9c]">
        {t("vacationRemaining", { count: remaining })}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <DbField label={t("from")}>
          <input name="startDate" type="date" required min={todayIso()} className={dbInputClass} />
        </DbField>
        <DbField label={t("until")}>
          <input name="endDate" type="date" required min={todayIso()} className={dbInputClass} />
        </DbField>
      </div>
      <DbField label={t("noteOptional")}>
        <textarea name="note" rows={3} maxLength={500} className={dbInputClass} />
      </DbField>
      <SubmitRow pending={pending} label={t("submitVacation")} />
    </form>
  );
}

function SicknessForm({ tenant, onDone }: { tenant: string; onDone: () => void }) {
  const t = useTranslations("MyArea.quick");
  const { pending, submit } = useSubmit(onDone);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("certificate");

    void submit(async () => {
      let attachmentFileId: string | undefined;

      // Wie in der App: erst das Attest als eigenes Dokument hochladen, dann
      // die Krankmeldung mit Verweis darauf anlegen.
      if (file instanceof File && file.size > 0) {
        const upload = await uploadMyDocumentFile({ tenant, file, documentType: "Krankmeldung" });

        if (!upload.ok) return upload;

        attachmentFileId = (upload.data as { document?: { id?: string } }).document?.id;
      }

      return postJson("/api/me/sickness-reports", {
        tenant,
        startDate: form.get("startDate"),
        endDate: form.get("endDate") || undefined,
        note: form.get("note"),
        attachmentFileId,
      });
    }, t("sicknessSent"));
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <div className="grid grid-cols-2 gap-3">
        <DbField label={t("from")}>
          <input name="startDate" type="date" required defaultValue={todayIso()} className={dbInputClass} />
        </DbField>
        <DbField label={t("untilOptional")}>
          <input name="endDate" type="date" className={dbInputClass} />
        </DbField>
      </div>
      <DbField label={t("certificate")} hint={t("certificateHint")}>
        <input name="certificate" type="file" accept="application/pdf,image/*" className={dbInputClass} />
      </DbField>
      <DbField label={t("noteOptional")}>
        <textarea name="note" rows={3} maxLength={500} className={dbInputClass} />
      </DbField>
      <SubmitRow pending={pending} label={t("submitSickness")} />
    </form>
  );
}

function WishFreeForm({ tenant, onDone }: { tenant: string; onDone: () => void }) {
  const t = useTranslations("MyArea.quick");
  const { pending, submit } = useSubmit(onDone);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    void submit(
      () => postJson("/api/me/wish-free-requests", { tenant, date: form.get("date"), reason: form.get("reason") }),
      t("wishFreeSent"),
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <DbField label={t("date")}>
        <input name="date" type="date" required min={todayIso()} className={dbInputClass} />
      </DbField>
      <DbField label={t("reasonOptional")}>
        <input name="reason" maxLength={300} className={dbInputClass} />
      </DbField>
      <SubmitRow pending={pending} label={t("submitWishFree")} />
    </form>
  );
}

function DocumentForm({ tenant, onDone }: { tenant: string; onDone: () => void }) {
  const t = useTranslations("MyArea.quick");
  const { pending, submit } = useSubmit(onDone);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "");

    if (!(file instanceof File) || file.size === 0) return;

    void submit(
      () =>
        uploadMyDocumentFile({
          tenant,
          file,
          documentType: kind === "Krankmeldung" ? "Krankmeldung" : "Sonstiges",
          slot: kind.startsWith("slot:") ? kind.slice(5) : undefined,
          description: String(form.get("description") ?? ""),
        }),
      t("documentSent"),
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <DbField label={t("documentKind")}>
        <select name="kind" defaultValue="Sonstiges" className={dbInputClass}>
          <option value="Sonstiges">{t("documentOther")}</option>
          <option value="Krankmeldung">{t("documentSickNote")}</option>
          {EMPLOYEE_DOCUMENT_SLOTS.map((slot) => (
            <option key={slot.key} value={`slot:${slot.key}`}>
              {slot.label}
            </option>
          ))}
        </select>
      </DbField>
      <DbField label={t("file")}>
        <input name="file" type="file" required accept="application/pdf,image/*" className={dbInputClass} />
      </DbField>
      <DbField label={t("descriptionOptional")}>
        <input name="description" maxLength={200} className={dbInputClass} />
      </DbField>
      <SubmitRow pending={pending} label={t("upload")} />
    </form>
  );
}

const actionIcons: Record<QuickAction, LucideIcon> = {
  vacation: Sun,
  sickness: Thermometer,
  wishFree: CalendarHeart,
  correction: History,
  document: Upload,
};

export default function MyQuickActions({
  tenant,
  vacationRemaining,
  timeTrackingEnabled,
}: {
  tenant: string;
  vacationRemaining: number;
  timeTrackingEnabled: boolean;
}) {
  const t = useTranslations("MyArea.quick");
  const [open, setOpen] = useState<QuickAction | null>(null);
  const actions: Array<{ id: QuickAction; title: string; subtitle: string }> = [
    { id: "vacation", title: t("vacationTitle"), subtitle: t("vacationSub", { count: vacationRemaining }) },
    { id: "sickness", title: t("sicknessTitle"), subtitle: t("sicknessSub") },
    { id: "wishFree", title: t("wishFreeTitle"), subtitle: t("wishFreeSub") },
    ...(timeTrackingEnabled
      ? [{ id: "correction" as const, title: t("correctionTitle"), subtitle: t("correctionSub") }]
      : []),
    { id: "document", title: t("documentTitle"), subtitle: t("documentSub") },
  ];
  const close = () => setOpen(null);
  const drawers: Record<QuickAction, { title: string; subtitle?: string; body: ReactNode }> = {
    vacation: {
      title: t("vacationTitle"),
      body: <VacationForm tenant={tenant} remaining={vacationRemaining} onDone={close} />,
    },
    sickness: { title: t("sicknessTitle"), subtitle: t("sicknessDrawerSub"), body: <SicknessForm tenant={tenant} onDone={close} /> },
    wishFree: { title: t("wishFreeTitle"), subtitle: t("wishFreeDrawerSub"), body: <WishFreeForm tenant={tenant} onDone={close} /> },
    correction: {
      title: t("correctionTitle"),
      subtitle: t("correctionDrawerSub"),
      body: <TimeCorrectionForm tenant={tenant} onDone={close} />,
    },
    document: { title: t("documentTitle"), subtitle: t("documentDrawerSub"), body: <DocumentForm tenant={tenant} onDone={close} /> },
  };

  return (
    <>
      <div className="mb-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        {actions.map((action) => {
          const Icon = actionIcons[action.id];

          return (
            <button
              key={action.id}
              type="button"
              className="db-quick db-card db-focus flex cursor-pointer flex-col items-start gap-3 rounded-[14px] border border-[#ecebe7] bg-white p-[18px] text-left"
              onClick={() => setOpen(action.id)}
            >
              <span className="flex size-[38px] items-center justify-center rounded-[10px] bg-[rgba(139,110,212,0.12)] text-[#7a5fd0] shadow-[inset_0_0_0_1px_rgba(139,110,212,0.25)]">
                <Icon size={17} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[14.5px] font-semibold text-ink">{action.title}</span>
                <span className="text-[12.5px] text-[#6e6e6b]">{action.subtitle}</span>
              </span>
            </button>
          );
        })}
      </div>

      {open && (
        <DbDrawer title={drawers[open].title} subtitle={drawers[open].subtitle} width={460} onClose={close}>
          {drawers[open].body}
        </DbDrawer>
      )}
    </>
  );
}
