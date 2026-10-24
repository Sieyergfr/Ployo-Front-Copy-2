/**
 * Rückgängig-Fenster für Datei-/Ordnerlöschungen durch Nutzer. Bewusst ohne
 * Server-Abhängigkeiten, damit Client-Komponenten Frist und Typen
 * mitbenutzen können.
 *
 * Eine Nutzer-Löschung (eine Datei, oder ein Ordner samt Unterordnern und
 * Dateien) bekommt eine gemeinsame `deletionBatchId` und lässt sich
 * innerhalb dieses Fensters als Ganzes wiederherstellen. Danach entfernt der
 * stündliche Cleanup-Cron sie endgültig (inkl. S3-Objekt).
 */
export const FILE_RESTORE_WINDOW_HOURS = 24;
export const FILE_RESTORE_WINDOW_MS = FILE_RESTORE_WINDOW_HOURS * 60 * 60 * 1000;

export type FileDeletionEntry = {
  batchId: string;
  kind: "file" | "folder";
  /** Datei- bzw. (oberster) Ordnername. */
  name: string;
  /** Ordnerpfad des gelöschten Ordners bzw. der Ordner, in dem die Datei lag ("" = oberste Ebene). */
  path: string;
  fileCount: number;
  folderCount: number;
  deletedAt: string;
  deletedByName: string;
  restorableUntil: string;
};

export type FileDeletionResult = {
  batchId: string;
  kind: "file" | "folder";
  name: string;
  fileCount: number;
  folderCount: number;
  restorableUntil: string;
};
