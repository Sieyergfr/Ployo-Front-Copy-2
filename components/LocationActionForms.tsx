"use client";

import {
  deleteLocationAction,
  updateLocationAction,
} from "@/app/(dashboard)/u/[tenant]/standorte/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import FloatingEditBar from "@/components/FloatingEditBar";
import { useActionStateWithToast } from "@/components/Toasts";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * `location-edit-form` ist ein verstecktes Formular ohne eigene sichtbare
 * Felder — alle Eingaben auf der Seite hängen sich per `form="location-edit-
 * form"` von überall im Baum daran (siehe standorte/[locationId]/page.tsx).
 * Client-Wrapper nur für `useActionState`, da die Server Component die Hook
 * nicht selbst aufrufen kann.
 */
export function LocationEditFormAndBar({
  tenant,
  locationId,
  cancelHref,
  isEditing,
}: {
  tenant: string;
  locationId: string;
  cancelHref: string;
  isEditing: boolean;
}) {
  const [, formAction, isPending] = useActionStateWithToast(updateLocationAction);

  return (
    <>
      <form
        id="location-edit-form"
        action={formAction}
        className="hidden"
        aria-hidden="true"
      >
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="locationId" value={locationId} />
      </form>
      {isEditing && (
        <FloatingEditBar cancelHref={cancelHref} formId="location-edit-form" isPending={isPending} />
      )}
    </>
  );
}

/** Löschen-Button (formAction-Override auf `location-edit-form`) + Bearbeiten-Link. */
export function LocationHeaderActions({
  locationName,
  locationEditHref,
  canDeleteLocation,
  canEditLocation,
}: {
  locationName: string;
  locationEditHref: string;
  canDeleteLocation: boolean;
  canEditLocation: boolean;
}) {
  const t = useTranslations("LocationDetailPage");
  const [, deleteFormAction] = useActionStateWithToast(deleteLocationAction);

  return (
    <div className="flex flex-wrap gap-2.5">
      {canDeleteLocation && (
        <ConfirmSubmitButton
          form="location-edit-form"
          formAction={deleteFormAction}
          className="btn btn-secondary btn-sm border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
          description={t("deleteConfirmDescription", { name: locationName })}
        >
          {t("delete")}
        </ConfirmSubmitButton>
      )}
      {canEditLocation && (
        <Link href={locationEditHref} className="btn btn-secondary btn-sm">
          <Pencil size={14} />
          {t("edit")}
        </Link>
      )}
    </div>
  );
}
