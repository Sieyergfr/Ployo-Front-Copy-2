"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { ActionState } from "@/lib/action-state";

type PopupOptions = {
  title?: ReactNode;
  content: ReactNode;
  /**
   * Breite des Dialogs. "narrow" für Dialoge mit einem einzigen kurzen Feld
   * (PIN-Abfrage) — auf voller Breite wirkt so ein Dialog wie ein leeres
   * Blatt mit einer Zeile darin.
   */
  size?: "default" | "narrow";
  className?: string;
  contentClassName?: string;
  hideCloseButton?: boolean;
  onClose?: () => void;
};

type ActivePopup = PopupOptions & {
  id: number;
};

type UniversalPopupContextValue = {
  openPopup: (options: PopupOptions) => void;
  closePopup: () => void;
  isPopupOpen: boolean;
};

const UniversalPopupContext =
  createContext<UniversalPopupContextValue | null>(null);

export function UniversalPopupProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("UniversalPopup");
  const [popup, setPopup] = useState<ActivePopup | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const closePopup = useCallback(() => {
    setPopup((current) => {
      current?.onClose?.();
      return null;
    });
  }, []);

  const openPopup = useCallback((options: PopupOptions) => {
    setPopup({
      ...options,
      id: Date.now(),
    });
  }, []);

  const contextValue = useMemo(
    () => ({
      openPopup,
      closePopup,
      isPopupOpen: Boolean(popup),
    }),
    [closePopup, openPopup, popup],
  );

  return (
    <UniversalPopupContext.Provider value={contextValue}>
      {children}

      {/*
       * `createPortal(..., document.body)` statt normalem Rendern an dieser
       * Stelle im Baum (QA-Bug BUG-010): ein per `useUniversalPopup()`
       * geöffneter Bestätigungsdialog (z. B. "Urlaubsantrag löschen") landete
       * bisher visuell UNTER einem bereits offenen `RightDrawer`
       * (ActionDrawers.tsx) — beide haben `z-index: 1000`, aber der Drawer
       * portalt schon nach `document.body` und war dadurch immer später im
       * DOM (spätere Geschwister gewinnen bei gleichem z-index). Da auch
       * dieser Dialog jetzt erst beim Öffnen nach `document.body` portalt
       * wird, landet er als neuestes Body-Kind immer über einem bereits
       * offenen Drawer, unabhängig von der Position im React-Baum.
       */}
      {popup &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-[6px]"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closePopup();
              }
            }}
          >
            <div
              key={popup.id}
              role="dialog"
              aria-modal="true"
              aria-labelledby={popup.title ? "universal-popup-title" : undefined}
              className={[
                "popup-scroll-inset relative max-h-[calc(100svh-48px)] w-full overflow-y-auto rounded-card border border-border bg-white p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)]",
                // Als eigener Eintrag statt im Basis-String: eine zweite
                // max-w-Klasse aus `className` würde sich sonst mit dieser
                // überlagern, und welche gewinnt, entscheidet die Reihenfolge im
                // erzeugten Stylesheet — nicht die im Attribut.
                popup.size === "narrow" ? "max-w-[320px]" : "max-w-[520px]",
                popup.className,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {!popup.hideCloseButton && (
                <button
                  type="button"
                  aria-label={t("closePopupAria")}
                  title={t("close")}
                  className="absolute top-4 right-4 flex size-8 cursor-pointer items-center justify-center rounded-[9px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
                  onClick={closePopup}
                >
                  <X size={15} strokeWidth={2} />
                </button>
              )}

              {popup.title && (
                <div
                  id="universal-popup-title"
                  className="mb-4 pr-10 font-display text-[22px] font-semibold leading-tight tracking-[-0.5px] text-ink"
                >
                  {popup.title}
                </div>
              )}

              <div className={popup.contentClassName ?? (popup.title ? "" : "pr-10")}>
                {popup.content}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </UniversalPopupContext.Provider>
  );
}

export function useUniversalPopup() {
  const context = useContext(UniversalPopupContext);

  if (!context) {
    throw new Error(
      "useUniversalPopup must be used inside UniversalPopupProvider.",
    );
  }

  return context;
}

/**
 * Schließt ein Popup automatisch, sobald eine mit `useActionState` verdrahtete
 * Server Action erfolgreich durchgelaufen ist. Nötig für jedes Popup-Formular,
 * dessen Action nur `revalidatePath` auslöst statt auf eine neue Seite
 * weiterzuleiten (z. B. weil sie auf derselben Seite bleibt) — sonst bliebe
 * das Popup nach erfolgreichem Absenden einfach offen stehen, ohne dass für
 * die Nutzerin/den Nutzer erkennbar ist, dass etwas passiert ist.
 */
export function useCloseOnSuccess(
  state: ActionState,
  isPending: boolean,
  onDone: () => void,
) {
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      onDone();
    }

    wasPending.current = isPending;
  }, [isPending, state, onDone]);
}
