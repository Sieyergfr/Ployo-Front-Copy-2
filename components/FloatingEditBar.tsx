"use client";

import { Loader2, Save, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export default function FloatingEditBar({
  cancelHref,
  formId,
  children,
}: {
  cancelHref: string;
  formId: string;
  children?: ReactNode;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const form = document.getElementById(formId);

    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    function handleSubmit() {
      setIsSubmitting(true);
    }

    form.addEventListener("submit", handleSubmit);

    return () => {
      form.removeEventListener("submit", handleSubmit);
    };
  }, [formId]);

  return (
    <>
      <div
        className="pointer-events-none fixed right-0 bottom-5 left-[236px] z-[900] flex justify-center px-[clamp(24px,4vw,60px)] max-md:left-0 max-md:px-4"
        data-unsaved-allow="true"
      >
        <div className="pointer-events-auto flex w-full max-w-[1080px] flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#D8D5CE] bg-white/95 px-3 py-3 shadow-[0_24px_90px_rgba(0,0,0,0.24)] backdrop-blur">
          <div className="min-w-0 px-1">
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted">
              Bearbeitungsmodus
            </div>
            <div className="mt-0.5 text-[12.5px] text-muted-2">
              Änderungen speichern oder verwerfen
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {children}
            <Link href={cancelHref} className="btn btn-secondary btn-sm">
              <X size={14} />
              Abbrechen
            </Link>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={isSubmitting}
              onClick={() => {
                const form = document.getElementById(formId);

                if (!(form instanceof HTMLFormElement)) {
                  return;
                }

                if (!form.checkValidity()) {
                  form.reportValidity();
                  return;
                }

                setIsSubmitting(true);
                form.requestSubmit();
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Wird gespeichert...
                </>
              ) : (
                <>
                  <Save size={14} />
                  Speichern
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      <div className="h-24" aria-hidden="true" />
    </>
  );
}
