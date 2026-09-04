"use client";

import { Loader2, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
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
  pendingLabel,
  className = "btn btn-primary",
  disabled,
  ...props
}: FormSubmitButtonProps) {
  const t = useTranslations("FormSubmitButton");
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
          {pendingLabel ?? t("saving")}
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
