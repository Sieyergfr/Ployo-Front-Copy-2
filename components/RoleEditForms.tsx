"use client";

import type { ReactNode } from "react";
import { deleteRoleAction, updateRoleAction } from "@/app/(dashboard)/u/[tenant]/rollen/actions";
import FloatingEditBar from "@/components/FloatingEditBar";
import { useActionStateWithToast } from "@/components/Toasts";

/**
 * Client-Wrapper um `deleteRoleAction`/`updateRoleAction` — nötig, weil
 * `rollen/[roleId]/page.tsx` eine Server Component ist und `useActionState`
 * nur in Client Components aufrufbar ist. Die eigentlichen Formularfelder
 * bleiben server-gerendert und kommen als `children` herein.
 */
export function DeleteRoleForm({
  tenant,
  roleId,
  children,
}: {
  tenant: string;
  roleId: string;
  children: ReactNode;
}) {
  const [, formAction] = useActionStateWithToast(deleteRoleAction);

  return (
    <form id="role-delete-form" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="roleId" value={roleId} />
      {children}
    </form>
  );
}

export function EditRoleForm({
  tenant,
  roleId,
  cancelHref,
  children,
}: {
  tenant: string;
  roleId: string;
  cancelHref: string;
  children: ReactNode;
}) {
  const [, formAction, isPending] = useActionStateWithToast(updateRoleAction);

  return (
    <>
      <form id="role-edit-form" action={formAction} className="grid gap-3">
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="roleId" value={roleId} />
        {children}
      </form>
      <FloatingEditBar cancelHref={cancelHref} formId="role-edit-form" isPending={isPending} />
    </>
  );
}
