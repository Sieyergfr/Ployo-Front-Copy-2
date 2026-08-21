"use client";

import { X } from "lucide-react";
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
import type { ActionState } from "@/lib/action-state";

type PopupOptions = {
  title?: ReactNode;
  content: ReactNode;
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
  const [popup, setPopup] = useState<ActivePopup | null>(null);

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

      {popup && (
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
              "relative max-h-[calc(100svh-48px)] w-full max-w-[520px] overflow-y-auto rounded-card border border-border bg-white p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)]",
              popup.className,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {!popup.hideCloseButton && (
              <button
                type="button"
                aria-label="Popup schließen"
                title="Schließen"
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
        </div>
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
