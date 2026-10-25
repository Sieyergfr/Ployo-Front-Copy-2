"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

function useEscape(onClose: () => void) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const t = useTranslations("DbUi");

  return (
    <button
      type="button"
      aria-label={t("close")}
      className="db-icon-btn-l db-focus flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[9px]"
      onClick={onClose}
    >
      <X size={17} />
    </button>
  );
}

/** Seitenleisten-Dialog (rechts) im Stil des Designs. Per Portal, damit transformierte Eltern ihn nicht einsperren. */
export function DbDrawer({
  title,
  subtitle,
  width = 480,
  onClose,
  children,
  footer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  width?: number;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();

  useEscape(onClose);

  return createPortal(
    <>
      <div className="db-drawer-scrim" aria-hidden="true" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby={titleId} className="db-drawer" style={{ width }}>
        <div className="flex items-start justify-between gap-3 px-6 pt-[22px] pb-3.5">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="m-0 font-display text-[22px] font-semibold tracking-[-0.5px]">
              {title}
            </h2>
            {subtitle && <span className="text-[13px] text-[#6e6e6b]">{subtitle}</span>}
          </div>
          <CloseButton onClose={onClose} />
        </div>
        <div className="db-drawer-body flex min-h-0 flex-auto flex-col gap-[18px] overflow-y-auto px-6 pb-6">
          {children}
        </div>
        {footer && <div className="border-t border-[#ecebe7] bg-white px-6 py-4">{footer}</div>}
      </aside>
    </>,
    document.body,
  );
}

/** Zentrierter Dialog (Bestätigungen, kurze Formulare). */
export function DbModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();

  useEscape(onClose);

  return createPortal(
    <>
      <div className="db-modal-scrim" aria-hidden="true" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="db-modal">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="m-0 font-display text-[20px] font-semibold tracking-[-0.4px]">
              {title}
            </h2>
            {subtitle && <span className="text-[13px] text-[#6e6e6b]">{subtitle}</span>}
          </div>
          <CloseButton onClose={onClose} />
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}

export const dbInputClass =
  "db-input box-border min-h-11 w-full rounded-[10px] border border-[#e4e3df] bg-[#fafaf8] px-3 py-2.5 text-[14px] text-ink";

export function DbField({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-[#6e6e6b]">{hint}</span>}
    </label>
  );
}
