"use client";

import { Loader2, type LucideIcon } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

type FormSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  Icon?: LucideIcon;
  /**
   * Fertig gerenderte Alternative zu `Icon`: ein Icon-Komponentenverweis
   * (`LucideIcon`) lässt sich nicht von einer Server- an diese Client-
   * Komponente weiterreichen (RSC kann keine Funktionen serialisieren) —
   * aus Server Components heraus stattdessen `icon={<Save size={15} />}`
   * übergeben.
   */
  icon?: ReactNode;
  pendingLabel?: string;
};

export default function FormSubmitButton({
  children,
  Icon,
  icon,
  pendingLabel = "Wird gespeichert...",
  className = "btn btn-primary",
  disabled,
  ...props
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      {...props}
      type="submit"
      className={className}
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" />
          {pendingLabel}
        </>
      ) : (
        <>
          {icon ?? (Icon && <Icon size={15} strokeWidth={2} />)}
          {children}
        </>
      )}
    </button>
  );
}
