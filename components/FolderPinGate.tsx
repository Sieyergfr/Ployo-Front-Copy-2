"use client";

import { FolderPinPanel } from "@/components/OwnerFilesTab";
import { useRouter } from "next/navigation";

/**
 * PIN-Abfrage für einen geschützten Ordner der zentralen Ablage.
 *
 * Früher ein ganzseitiges Formular; jetzt derselbe Popup-Dialog wie in den
 * Eigentümer-Ablagen (Mitarbeiter/Standort/Team), damit die PIN-Abfrage
 * überall gleich aussieht und sich wegklicken lässt, ohne die Seite zu
 * verlassen.
 */
export default function FolderPinGate({
  tenant,
  folderPath,
  folderName,
  returnPath,
}: {
  tenant: string;
  folderPath: string;
  folderName: string;
  /** Ziel nach erfolgreicher Eingabe — sonst bliebe die Ansicht auf dem Gate stehen. */
  returnPath: string;
}) {
  const router = useRouter();

  return (
    <section className="rounded-card border border-border bg-white">
      <FolderPinPanel
        tenant={tenant}
        ownerType="tenant"
        folderName={folderName}
        folderPath={folderPath}
        onUnlocked={() => router.replace(returnPath)}
      />
    </section>
  );
}
