export type AuditLogEntry = {
  id: string;
  actor: string;
  action: string;
  source: string;
  timestamp: string;
  ipAddress?: string;
  detail?: string;
};

export function makeAuditLogs(entity: {
  id: string;
  name: string;
  source: string;
}): AuditLogEntry[] {
  return [
    {
      id: `${entity.id}-view`,
      actor: "Carla Brandt",
      action: "Datensatz geöffnet",
      source: entity.source,
      timestamp: "30.06.2026 · 10:42",
      ipAddress: "10.24.8.14",
      detail: entity.name,
    },
    {
      id: `${entity.id}-edit`,
      actor: "Thomas Berger",
      action: "Stammdaten aktualisiert",
      source: "Web-App",
      timestamp: "29.06.2026 · 16:08",
      ipAddress: "10.24.8.22",
      detail: "Änderung über Bearbeiten-Dialog",
    },
    {
      id: `${entity.id}-export`,
      actor: "System",
      action: "Berechtigung geprüft",
      source: "Policy Engine",
      timestamp: "29.06.2026 · 16:08",
      detail: "Rolle HR-Leitung erlaubt Lesen/Schreiben",
    },
  ];
}

export function makeFileAuditLogs(fileName: string): AuditLogEntry[] {
  return [
    {
      id: `${fileName}-opened`,
      actor: "Carla Brandt",
      action: "Datei geöffnet",
      source: "Dateien",
      timestamp: "30.06.2026 · 11:21",
      ipAddress: "10.24.8.14",
      detail: fileName,
    },
    {
      id: `${fileName}-downloaded`,
      actor: "Thomas Berger",
      action: "Datei heruntergeladen",
      source: "Preview",
      timestamp: "30.06.2026 · 09:44",
      ipAddress: "10.24.8.22",
      detail: "Version v2",
    },
    {
      id: `${fileName}-version`,
      actor: "Carla Brandt",
      action: "Neue Version hochgeladen",
      source: "Upload",
      timestamp: "28.06.2026 · 14:17",
      detail: "Automatische Versionierung auf v3",
    },
  ];
}
