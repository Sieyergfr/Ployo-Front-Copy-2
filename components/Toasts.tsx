"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ActionState } from "@/lib/action-state";

export type ToastTone = "success" | "warning" | "error" | "info";

export type ToastInput = {
  tone?: ToastTone;
  title: string;
  subtitle?: string;
  duration?: number;
  /** Optionale Schaltfläche im Toast, z. B. "Rückgängig" nach dem Löschen. Schließt den Toast beim Klick. */
  action?: { label: string; onClick: () => void };
};

type ToastItem = ToastInput & {
  id: number;
  tone: ToastTone;
  isExiting?: boolean;
};

type ToastContextValue = {
  toast: (input: ToastInput) => number;
  dismissToast: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneConfig: Record<
  ToastTone,
  {
    Icon: LucideIcon;
    iconClassName: string;
    borderClassName: string;
  }
> = {
  success: {
    Icon: CheckCircle2,
    iconClassName: "bg-success/10 text-success",
    borderClassName: "border-success/25",
  },
  warning: {
    Icon: AlertTriangle,
    iconClassName: "bg-warning/10 text-warning",
    borderClassName: "border-warning/25",
  },
  error: {
    Icon: XCircle,
    iconClassName: "bg-danger/10 text-danger",
    borderClassName: "border-danger/25",
  },
  info: {
    Icon: Info,
    iconClassName: "bg-[#2A6FDB]/10 text-[#2A6FDB]",
    borderClassName: "border-[#2A6FDB]/25",
  },
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const t = useTranslations("Toasts");
  const touchStartX = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const config = toneConfig[item.tone];
  const Icon = config.Icon;

  return (
    <article
      role="status"
      aria-live={item.tone === "error" ? "assertive" : "polite"}
      className={cx(
        "toast-card flex w-full items-start gap-2.5 rounded-[12px] border bg-white px-3 py-2.5 shadow-[0_14px_42px_rgba(0,0,0,0.12)]",
        item.isExiting && "toast-card-exit",
        config.borderClassName,
        dragX !== 0 && "translate-x-[var(--drag-x)]",
      )}
      style={dragX !== 0 ? ({ "--drag-x": `${dragX}px` } as CSSProperties) : undefined}
      onPointerDown={(event) => {
        if (event.pointerType === "touch") {
          touchStartX.current = event.clientX;
        }
      }}
      onPointerMove={(event) => {
        if (touchStartX.current === null) {
          return;
        }

        setDragX(event.clientX - touchStartX.current);
      }}
      onPointerUp={() => {
        if (Math.abs(dragX) > 88) {
          onDismiss(item.id);
        } else {
          setDragX(0);
        }
        touchStartX.current = null;
      }}
      onPointerCancel={() => {
        touchStartX.current = null;
        setDragX(0);
      }}
    >
      <span
        className={cx(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[8px]",
          config.iconClassName,
        )}
      >
        <Icon size={14} strokeWidth={2.3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold leading-[17px] text-ink">
          {item.title}
        </span>
        {item.subtitle && (
          <span className="mt-px block text-[11.5px] leading-[17px] text-muted-2">
            {item.subtitle}
          </span>
        )}
        {item.action && (
          <button
            type="button"
            className="mt-1.5 cursor-pointer rounded-[7px] border border-border px-2 py-[3px] text-[11.5px] font-semibold text-ink transition-colors hover:bg-bg"
            onClick={() => {
              item.action?.onClick();
              onDismiss(item.id);
            }}
          >
            {item.action.label}
          </button>
        )}
      </span>
      <button
        type="button"
        className="hidden size-6 shrink-0 cursor-pointer items-center justify-center rounded-[7px] text-muted transition-colors hover:bg-bg hover:text-ink md:flex"
        aria-label={t("closeToastAria")}
        title={t("close")}
        onClick={() => onDismiss(item.id)}
      >
        <X size={13} strokeWidth={2.2} />
      </button>
    </article>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: number) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, isExiting: true } : item,
      ),
    );
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 180);
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const item: ToastItem = {
        ...input,
        id,
        tone: input.tone ?? "info",
      };

      setItems((current) => [item, ...current].slice(0, 5));

      if (input.duration !== 0) {
        window.setTimeout(() => dismissToast(id), input.duration ?? 5200);
      }

      return id;
    },
    [dismissToast],
  );

  const value = useMemo(
    () => ({
      toast,
      dismissToast,
    }),
    [dismissToast, toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[1600] flex w-[min(320px,calc(100vw-24px))] flex-col-reverse gap-2 max-md:right-3 max-md:bottom-3">
        {items.map((item) => (
          <div key={item.id} className="pointer-events-auto">
            <ToastCard item={item} onDismiss={dismissToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside ToastProvider.");
  }

  return context;
}

/**
 * Zeigt einen Fehler-Toast, sobald eine mit `useActionState` verdrahtete
 * Server Action mit `state.error` durchgelaufen ist — Gegenstück zu
 * `useCloseOnSuccess` (components/UniversalPopup.tsx), gleiches
 * Pending→Settled-Tracking, nur für den Fehler- statt den Erfolgsfall.
 */
export function useActionErrorToast(state: ActionState, isPending: boolean) {
  const { toast } = useToast();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && state.error) {
      toast({ tone: "error", title: state.error });
    }

    wasPending.current = isPending;
  }, [isPending, state, toast]);
}

const EMPTY_ACTION_STATE: ActionState = {};

/**
 * `useActionState` + `useActionErrorToast` in einem Aufruf — der Regelfall
 * für jede rohe Server Action, die auf einen Toast statt auf die
 * Error-Boundary umgestellt wird. Eigene lokale Leer-Konstante statt des
 * `initialActionState`-Exports aus `lib/action-state.ts`: diese Datei ist
 * `"server-only"`, ein Werte-Import davon würde den Client-Bundle brechen
 * (gleiches Muster wie in `components/auth/AvatarUploadForm.tsx`).
 */
export function useActionStateWithToast<Payload>(
  action: (state: ActionState, payload: Payload) => Promise<ActionState>,
) {
  const [state, dispatch, isPending] = useActionState(action, EMPTY_ACTION_STATE);
  useActionErrorToast(state, isPending);

  return [state, dispatch, isPending] as const;
}
