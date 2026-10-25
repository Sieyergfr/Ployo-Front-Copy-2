"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export const dbMenuItemClass = "db-ms-opt text-[13px] font-medium text-ink disabled:cursor-default disabled:opacity-50";

/**
 * "…"-Menü im Stil des Designs. Einträge sind beliebige Buttons/Links; ein
 * Klick auf einen Eintrag schließt das Menü (Dialoge, die er öffnet, liegen
 * in eigenen Portalen und bleiben offen).
 */
export function DbMenu({ label, children, align = "right" }: { label: string; children: ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="db-focus flex size-8 cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent text-[#6e6e6b] hover:bg-[#f2f1ed] hover:text-ink"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreHorizontal size={17} />
      </button>
      {open && (
        <div
          role="menu"
          className={`db-pop-light absolute top-[calc(100%+4px)] z-30 flex min-w-[200px] flex-col rounded-[12px] bg-white p-1.5 ${align === "right" ? "right-0" : "left-0"}`}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
