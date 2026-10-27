"use client";

import { useActionStateWithToast, useToast } from "@/components/Toasts";
import type { ActionState } from "@/lib/action-state";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Ein-Klick-Anfrage (Zugriff anfragen, Inhaber:in erinnern, Einladung
 * ablehnen): Fehler kommen als Toast, Erfolg als Toast plus erledigter Zustand.
 */
export default function SelfServiceRequestButton({
  action,
  fields,
  className,
  children,
  doneLabel,
  successTitle,
  successSubtitle,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  className: string;
  children: ReactNode;
  doneLabel: string;
  successTitle: string;
  successSubtitle?: string;
}) {
  const [state, formAction, isPending] = useActionStateWithToast(action);
  const { toast } = useToast();
  const shown = useRef<ActionState | null>(null);

  useEffect(() => {
    if (state.success && shown.current !== state) {
      shown.current = state;
      toast({ tone: "success", title: successTitle, subtitle: successSubtitle });
    }
  }, [state, successTitle, successSubtitle, toast]);

  return (
    <form action={formAction}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className={className} disabled={isPending || Boolean(state.success)}>
        {isPending ? <Loader2 size={14} className="animate-spin" /> : state.success ? <Check size={14} /> : null}
        {state.success ? doneLabel : children}
      </button>
    </form>
  );
}
