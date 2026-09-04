"use client";

import {
  setEmployeeFileVisibilityAction,
  setEmployeeFolderVisibilityAction,
} from "@/app/(dashboard)/u/[tenant]/employees/actions";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Datei oder Ordner einer Personalakte vor dem Mitarbeiter selbst verbergen —
 * jederzeit wieder umschaltbar.
 *
 * Bewusst kein Löschen und keine Zugriffsrolle: die Unterlage bleibt in der
 * Akte und für HR sichtbar, nur die Selbstauskunft des Mitarbeiters
 * ("Mein Bereich", Personalakte in der App) lässt sie aus. Ein verborgener
 * Ordner nimmt seinen Inhalt und alle Unterordner mit.
 */
export type EmployeeVisibilityTarget =
  | { kind: "file"; fileId: string }
  | { kind: "folder"; employeeId: string; path: string };

export default function EmployeeVisibilityToggle({
  tenant,
  employeeHandle,
  target,
  hidden,
  name,
}: {
  tenant: string;
  employeeHandle: string;
  target: EmployeeVisibilityTarget;
  hidden: boolean;
  name: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const subject = target.kind === "folder" ? "Ordner" : "Datei";
  const title = hidden
    ? `${subject} ist vor dem Mitarbeiter verborgen — wieder freigeben`
    : `${subject} vor dem Mitarbeiter verbergen`;

  const toggle = () => {
    const formData = new FormData();

    formData.set("tenant", tenant);
    formData.set("employeeHandle", employeeHandle);
    formData.set("hidden", hidden ? "false" : "true");

    if (target.kind === "file") {
      formData.set("fileId", target.fileId);
    } else {
      formData.set("employeeId", target.employeeId);
      formData.set("path", target.path);
    }

    startTransition(async () => {
      if (target.kind === "file") {
        await setEmployeeFileVisibilityAction(formData);
      } else {
        await setEmployeeFolderVisibilityAction(formData);
      }

      router.refresh();
    });
  };

  return (
    <button
      type="button"
      className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border bg-white transition-colors disabled:cursor-wait disabled:opacity-60 ${
        hidden
          ? "border-danger/30 text-danger hover:border-danger/60"
          : "border-border text-muted hover:border-muted hover:text-ink"
      }`}
      title={title}
      aria-label={`${name}: ${title}`}
      aria-pressed={hidden}
      disabled={isPending}
      onClick={toggle}
    >
      {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
    </button>
  );
}
