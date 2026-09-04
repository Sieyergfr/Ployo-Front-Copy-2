"use client";

import { useUniversalPopup } from "@/components/UniversalPopup";
import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { type ReactNode, useEffect } from "react";

export function UnsavedChangesGuard({ active }: { active: boolean }) {
  const t = useTranslations("EditSafety");
  const { openPopup, closePopup } = useUniversalPopup();

  useEffect(() => {
    if (!active) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const link = target?.closest("a[href]");

      if (!link || link.closest("[data-unsaved-allow='true']")) {
        return;
      }

      const href = link.getAttribute("href");

      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      openPopup({
        title: t("unsavedChangesTitle"),
        content: (
          <div>
            <p className="m-0 text-[13px] leading-[1.55] text-muted-2">
              {t("unsavedChangesBody")}
            </p>
            <div className="mt-5 flex justify-end gap-2.5 border-t border-border-soft pt-4">
              <button type="button" className="btn btn-secondary" onClick={closePopup}>
                {t("continueEditing")}
              </button>
              <Link
                href={href}
                className="btn btn-primary"
                data-unsaved-allow="true"
                onClick={closePopup}
              >
                {t("leavePage")}
              </Link>
            </div>
          </div>
        ),
      });
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [active, closePopup, openPopup, t]);

  return null;
}

export function ConfirmedSaveLink({
  href,
  children,
  className = "btn btn-primary btn-sm",
}: {
  href: string;
  children?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("EditSafety");
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        openPopup({
          title: t("confirmSaveTitle"),
          content: (
            <div>
              <p className="m-0 text-[13px] leading-[1.55] text-muted-2">
                {t("confirmSaveBody")}
              </p>
              <div className="mt-5 flex justify-end gap-2.5 border-t border-border-soft pt-4">
                <button type="button" className="btn btn-secondary" onClick={closePopup}>
                  {t("cancel")}
                </button>
                <Link
                  href={href}
                  className="btn btn-primary"
                  data-unsaved-allow="true"
                  onClick={closePopup}
                >
                  <Save size={15} />
                  {t("save")}
                </Link>
              </div>
            </div>
          ),
        });
      }}
    >
      {children ?? (
        <>
          <Save size={14} />
          {t("save")}
        </>
      )}
    </button>
  );
}
