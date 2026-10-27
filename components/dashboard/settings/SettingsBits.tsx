"use client";

import { DbSwitch } from "@/components/dashboard/ui";
import { useToast } from "@/components/Toasts";
import type { ActionState } from "@/lib/action-state";
import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";

/**
 * Bausteine der Einstellungsseite: Karten, Zeilen und Formulare, die
 * Änderungen automatisch speichern (Schalter sofort, Texte nach kurzer Pause).
 */

type AutoSaveApi = { schedule: (delay?: number) => void };

const AutoSaveContext = createContext<AutoSaveApi>({ schedule: () => {} });

export function useAutoSave() {
  return useContext(AutoSaveContext);
}

export function AutoSaveForm<T extends ActionState>({
  action,
  children,
  hidden,
  onSaved,
  className = "flex flex-col gap-4",
}: {
  action: (formData: FormData) => Promise<T>;
  children: ReactNode;
  /** Feste Felder (z. B. tenant, category). */
  hidden?: Record<string, string>;
  onSaved?: (result: T) => void;
  className?: string;
}) {
  const t = useTranslations("SettingsPage");
  const { toast } = useToast();
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  function save() {
    if (!ref.current || !ref.current.reportValidity()) return;

    const formData = new FormData(ref.current);

    setStatus("saving");
    action(formData).then((result) => {
      if (result.error) {
        setStatus("idle");
        toast({ tone: "error", title: result.error });
        return;
      }

      setStatus("saved");
      onSaved?.(result);
      setTimeout(() => setStatus((current) => (current === "saved" ? "idle" : current)), 2000);
    });
  }

  function schedule(delay = 150) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, delay);
  }

  return (
    <AutoSaveContext.Provider value={{ schedule }}>
      <form
        ref={ref}
        className={className}
        onSubmit={(event) => {
          event.preventDefault();
          schedule(0);
        }}
        onChange={(event) => {
          const target = event.target as unknown as HTMLInputElement;

          schedule(["text", "email", "number", "textarea", "time"].includes(target.type) ? 900 : 150);
        }}
      >
        {Object.entries(hidden ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {children}
        <div aria-live="polite" className="pointer-events-none fixed right-6 bottom-6 z-30">
          {status !== "idle" && (
            <span className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
              {status === "saving" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
              {status === "saving" ? t("saving") : t("saved")}
            </span>
          )}
        </div>
      </form>
    </AutoSaveContext.Provider>
  );
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

/** Schalter mit verstecktem Formularfeld ("on" bzw. leer) — speichert sofort. */
export function SettingSwitch({ name, defaultChecked, label, disabled }: { name: string; defaultChecked: boolean; label: string; disabled?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  const { schedule } = useAutoSave();

  return (
    <span className="flex justify-end">
      {checked && <input type="hidden" name={name} value="on" />}
      <DbSwitch
        checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          setChecked((value) => !value);
          schedule();
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
  const { schedule } = useAutoSave();

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
              schedule();
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
