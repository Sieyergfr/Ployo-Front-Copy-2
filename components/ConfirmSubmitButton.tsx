"use client";

import { useUniversalPopup } from "@/components/UniversalPopup";
import { Trash2 } from "lucide-react";
import { useRef, type ReactNode } from "react";

type ConfirmSubmitButtonProps = {
  children?: ReactNode;
  className?: string;
  confirmLabel?: string;
  description?: string;
  form?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  title?: string;
};

/**
 * Absenden hinter einer Bestätigung.
 *
 * Abgeschickt wird über einen versteckten Submit-Button, der **an dieser
 * Stelle** im Baum bleibt — also innerhalb des Formulars, zu dem er gehört.
 * Der sichtbare Knopf im Bestätigungsdialog löst ihn nur aus.
 *
 * Vorher war der Submit-Button selbst der Knopf im Dialog. Das ging schief:
 * der Dialog wird vom `UniversalPopupProvider` ganz oben im Baum gerendert,
 * der Knopf lag damit außerhalb des Formulars (nur per `form`-Attribut damit
 * verbunden) — und sein `onClick` schloss den Dialog, entfernte sich also
 * selbst aus dem DOM, bevor der Browser das Absenden ausführen konnte. Das
 * Formular wurde nie abgeschickt: "Auf veröffentlichte Version zurücksetzen"
 * und "Schicht löschen" taten sichtbar nichts.
 */
export default function ConfirmSubmitButton({
  children,
  className = "btn btn-secondary text-danger",
  confirmLabel = "Löschen",
  description = "Diese Aktion kann nicht automatisch rückgängig gemacht werden.",
  form,
  formAction,
  title = "Löschen bestätigen",
}: ConfirmSubmitButtonProps) {
  const { openPopup, closePopup } = useUniversalPopup();
  const submitRef = useRef<HTMLButtonElement>(null);

  const submit = () => {
    // Erst absenden, dann schließen: `click()` führt die Standardaktion
    // synchron aus, das Formular ist also bereits unterwegs, wenn der Dialog
    // verschwindet.
    submitRef.current?.click();
    closePopup();
  };

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          openPopup({
            title,
            size: "narrow",
            content: (
              <div>
                <p className="m-0 text-[13px] leading-[1.55] text-muted-2">
                  {description}
                </p>
                <div className="mt-5 flex justify-end gap-2.5 border-t border-border-soft pt-4">
                  <button type="button" className="btn btn-secondary" onClick={closePopup}>
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
                    onClick={submit}
                  >
                    <Trash2 size={15} />
                    {confirmLabel}
                  </button>
                </div>
              </div>
            ),
          });
        }}
      >
        {children ?? (
          <>
            <Trash2 size={15} />
            {confirmLabel}
          </>
        )}
      </button>

      <button
        ref={submitRef}
        type="submit"
        form={form}
        formAction={formAction}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-unsaved-allow="true"
      />
    </>
  );
}
