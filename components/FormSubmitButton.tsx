"use client";

import { Loader2, type LucideIcon } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

type FormSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  Icon?: LucideIcon;
  pendingLabel?: string;
};

export default function FormSubmitButton({
  children,
  Icon,
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
          {Icon && <Icon size={15} strokeWidth={2} />}
          {children}
        </>
      )}
    </button>
  );
}
