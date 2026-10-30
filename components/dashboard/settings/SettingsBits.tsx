"use client";

import { DbSwitch } from "@/components/dashboard/ui";
import { useToast } from "@/components/Toasts";
import type { ActionState } from "@/lib/action-state";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, useContext, useState, type ReactNode } from "react";

/** Gemeinsame Einstellungsformulare: Änderungen werden erst ausdrücklich gespeichert. */
type SettingsFormApi = { markDirty: () => void };
const SettingsFormContext = createContext<SettingsFormApi>({ markDirty: () => {} });
export function useSettingsForm() { return useContext(SettingsFormContext); }

export function SettingsForm<T extends ActionState>({ action, children, hidden, onSaved, className = "flex flex-col gap-4" }: {
  action: (formData: FormData) => Promise<T>;
  children: ReactNode;
  hidden?: Record<string, string>;
  onSaved?: (result: T) => void;
  className?: string;
}) {
  const t = useTranslations("SettingsPage");
  const { toast } = useToast();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  return <SettingsFormContext.Provider value={{ markDirty: () => setDirty(true) }}>
    <form className={className} onChange={() => setDirty(true)} onSubmit={async (event) => {
      event.preventDefault();
      if (saving || !event.currentTarget.reportValidity()) return;
      const payload = new FormData(event.currentTarget);
      setSaving(true);
      try {
        const result = await action(payload);
        if (result.error) { toast({ tone: "error", title: result.error }); return; }
        setDirty(false);
        toast({ tone: "success", title: t("saved") });
        onSaved?.(result);
        router.refresh();
      } catch {
        toast({ tone: "error", title: t("saveFailed") });
      } finally { setSaving(false); }
    }}>
      <fieldset disabled={saving} className="contents">
        {Object.entries(hidden ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        {children}
      </fieldset>
      <div className="sticky bottom-3 z-20 mt-1 flex items-center justify-between gap-3 rounded-xl border border-border bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm">
        <span aria-live="polite" className="text-[12px] text-muted-2">{dirty ? t("unsavedChanges") : t("noChanges")}</span>
        <button type="submit" disabled={saving || !dirty} className="db-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-ink px-5 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
          {saving && <Loader2 size={15} className="animate-spin" />}{saving ? t("saving") : t("saveChanges")}
        </button>
      </div>
    </form>
  </SettingsFormContext.Provider>;
}

export function SettingsCard({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <section className="db-card rounded-[16px] border border-[#ecebe7] bg-white px-5 pt-[18px] pb-1.5">
      <div className="flex flex-col gap-0.5 border-b border-[#f0efeb] pb-3.5">
        <h2 className="m-0 font-display text-[17px] font-semibold tracking-[-0.3px]">{title}</h2>
        {subtitle && <span className="text-[13px] text-[#6e6e6b]">{subtitle}</span>}
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  hint,
  children,
  stacked = false,
  badge,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  stacked?: boolean;
  badge?: ReactNode;
}) {
  return (
    <div
      className={`grid gap-3 border-b border-[#f0efeb] py-3.5 last:border-b-0 ${
        stacked ? "" : "items-center md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
          {label}
          {badge}
        </span>
        {hint && <span className="text-[13px] leading-[1.45] text-[#6e6e6b]">{hint}</span>}
      </div>
      {children && <div className={`min-w-0 ${stacked ? "" : "md:justify-self-end md:w-full"}`}>{children}</div>}
    </div>
  );
}

/** Schalter mit verstecktem Formularfeld ("on" bzw. leer) — wird mit dem Formular gespeichert. */
export function SettingSwitch({ name, defaultChecked, label, disabled }: { name: string; defaultChecked: boolean; label: string; disabled?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  const { markDirty } = useSettingsForm();

  return (
    <span className="flex justify-end">
      {checked && <input type="hidden" name={name} value="on" />}
      <DbSwitch
        checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          setChecked((value) => !value);
          markDirty();
        }}
      />
    </span>
  );
}

/** Segment-Auswahl mit verstecktem Formularfeld. */
export function SettingSegments({
  name,
  defaultValue,
  options,
  label,
  onChange,
}: {
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
  label: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const { markDirty } = useSettingsForm();

  return (
    <span className="flex md:justify-end">
      <input type="hidden" name={name} value={value} />
      <span role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-[10px] bg-[#f2f1ed] p-[3px]">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => {
              setValue(option.value);
              onChange?.(option.value);
              markDirty();
            }}
            className={`db-focus min-h-9 cursor-pointer rounded-[8px] border-0 px-3 text-[13px] whitespace-nowrap ${
              value === option.value ? "bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "bg-transparent font-medium text-[#6e6e6b]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </span>
    </span>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 rounded-[12px] border border-[rgba(44,100,201,0.25)] bg-[rgba(44,100,201,0.06)] px-3.5 py-2.5 text-[13px] leading-[1.5] text-[#2c64c9]">
      {children}
    </div>
  );
}

export function SoonBadge() {
  const t = useTranslations("SettingsPage");

  return <span className="rounded-[6px] bg-[rgba(139,111,224,0.12)] px-1.5 py-[1px] text-[11px] font-semibold text-[#6b4fc4]">{t("soon")}</span>;
}
