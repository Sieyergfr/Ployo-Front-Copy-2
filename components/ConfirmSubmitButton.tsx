"use client";

import { useUniversalPopup } from "@/components/UniversalPopup";
import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";

type ConfirmSubmitButtonProps = {
  children?: ReactNode;
  className?: string;
  confirmLabel?: string;
  description?: string;
  form?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  title?: string;
};

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

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        openPopup({
          title,
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
                  type="submit"
                  form={form}
                  formAction={formAction}
                  className="btn btn-secondary border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
                  data-unsaved-allow="true"
                  onClick={closePopup}
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
  );
}
