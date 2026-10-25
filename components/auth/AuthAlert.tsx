import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

/** Fehlermeldung oberhalb bzw. innerhalb eines Auth-Formulars. */
export default function AuthAlert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-[10px] border border-danger/25 bg-danger/5 px-3 py-2.5 text-[12.5px] leading-[1.5] text-danger"
    >
      <CircleAlert size={15} strokeWidth={2} className="mt-px shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
