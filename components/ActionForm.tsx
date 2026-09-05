"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";
import { useActionStateWithToast } from "@/components/Toasts";

type ActionFn = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Client-Wrapper für ein einzelnes `<form action={...}>`, dessen Felder
 * bereits vollständig als `children` server-gerendert sind und keine
 * eigene Client-Logik brauchen (kein `formAction`-Override, keine
 * Mehrfach-Action) — nur `useActionState` + Toast bei Fehler. Für Server-
 * Component-Seiten mit einem einzigen, in sich geschlossenen Formular;
 * Formulare mit mehreren Actions (z. B. "Speichern" + "Löschen" auf
 * demselben Formular) brauchen weiterhin einen eigenen kleinen Wrapper wie
 * `components/RoleEditForms.tsx`.
 */
export default function ActionForm({
  action,
  children,
  ...formProps
}: {
  action: ActionFn;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"form">, "action" | "children">) {
  const [, formAction] = useActionStateWithToast(action);

  return (
    <form action={formAction} {...formProps}>
      {children}
    </form>
  );
}
