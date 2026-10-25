"use client";

import type { ReactNode } from "react";
import {
  deleteEmployeeAction,
  deleteEmployeeDataByCategoryAction,
  inviteEmployeeAction,
  updateEmployeeAction,
} from "@/app/(dashboard)/u/[tenant]/employees/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import FloatingEditBar from "@/components/FloatingEditBar";
import { useActionStateWithToast } from "@/components/Toasts";
import { UserPlus } from "lucide-react";

/**
 * Client-Wrapper um die Mitarbeiter-Detailseite (Server Component) —
 * `useActionState` ist nur in Client Components aufrufbar. Die gesamte
 * Seite (Tabs, Verträge, Dateien, Verlauf ...) liegt heute innerhalb dieses
 * einen `<form id="employee-edit-form">` und kommt unverändert als
 * `children` herein.
 */
export function EmployeeEditFormAndBar({
  tenant,
  employeeId,
  employeeHandle,
  activeTab,
  cancelHref,
  isEditing,
  children,
}: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
  activeTab: "contract" | "home" | "data";
  cancelHref: string;
  isEditing: boolean;
  children: ReactNode;
}) {
  const [, formAction, isPending] = useActionStateWithToast(updateEmployeeAction);

  return (
    <form id="employee-edit-form" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="employeeHandle" value={employeeHandle} />
      <input type="hidden" name="activeTab" value={activeTab} />
      {children}
      {isEditing && (
        <FloatingEditBar cancelHref={cancelHref} formId="employee-edit-form" isPending={isPending} />
      )}
    </form>
  );
}

/** Löschen-Button (formAction-Override auf `employee-edit-form`). */
export function EmployeeDeleteButton({
  className,
  description,
  children,
}: {
  className?: string;
  description: string;
  children: ReactNode;
}) {
  const [, formAction] = useActionStateWithToast(deleteEmployeeAction);

  return (
    <ConfirmSubmitButton
      className={className}
      form="employee-edit-form"
      formAction={formAction}
      description={description}
    >
      {children}
    </ConfirmSubmitButton>
  );
}

/** Einladen-Button (formAction-Override auf `employee-edit-form`, kein eigener Dialog). */
export function EmployeeInviteButton({ label }: { label: string }) {
  const [, formAction] = useActionStateWithToast(inviteEmployeeAction);

  return (
    <button type="submit" formAction={formAction} className="btn btn-secondary btn-sm">
      <UserPlus size={14} />
      {label}
    </button>
  );
}

/** Löschen-Button (formAction-Override auf `employee-retention-form`). */
export function RetentionDeleteButton({
  className,
  title,
  description,
  children,
}: {
  className?: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const [, formAction] = useActionStateWithToast(deleteEmployeeDataByCategoryAction);

  return (
    <ConfirmSubmitButton
      className={className}
      form="employee-retention-form"
      formAction={formAction}
      title={title}
      description={description}
    >
      {children}
    </ConfirmSubmitButton>
  );
}
