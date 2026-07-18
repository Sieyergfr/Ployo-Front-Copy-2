"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastTone = "success" | "warning" | "error" | "info";

export type ToastInput = {
  tone?: ToastTone;
  title: string;
  subtitle?: string;
  duration?: number;
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
      )}
      style={dragX !== 0 ? { transform: `translateX(${dragX}px)` } : undefined}
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
      </span>
      <button
        type="button"
        className="hidden size-6 shrink-0 cursor-pointer items-center justify-center rounded-[7px] text-muted transition-colors hover:bg-bg hover:text-ink md:flex"
        aria-label="Toast schliessen"
        title="Schliessen"
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
