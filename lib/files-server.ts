import "server-only";

import { canAccessFileAcl, loadTenantFolderAcl, requireTenantFileAreaAccess } from "@/lib/file-access";
import { isFolderPathDenied, parseIdList } from "@/lib/file-folders";
import {
  formatUpdatedAt,
  mapTenantFileToFileItem,
  type FileFolder,
  type FileUploadOptions,
  type ReminderFileBrowserData,
  type ReminderFileBrowserSource,
} from "@/lib/files";
import { prisma } from "@/lib/prisma";
import {
  assertEmployeeInScope,
  assertLocationInScope,
  assertTeamInScope,
  requireTenantAccess,
  resolveScopeFilter,
} from "@/lib/tenant-access";

type TenantFileFolderRecord = {
  id: string;
  name: string;
  slug: string;
  path: string;
  parentId: string | null;
  ownerName: string;
  locked: boolean;
  pinned: boolean;
  accessRoleIdsJson: unknown;
  sharedWithEmployees: boolean;
  visibleTeamIdsJson: unknown;
  visibleLocationIdsJson: unknown;
  updatedAt: Date;
  createdAt: Date;
};

/** Zuletzt aktualisierte Unternehmensdateien (ACL-gefiltert) fürs Dashboard. */
export async function getRecentTenantFiles(tenantSlug: string, limit = 4) {
  const tenant = await requireTenantAccess(tenantSlug, "files", "read");
  const records = await prisma.tenantFile.findMany({
    where: {
      tenantId: tenant.tenantId,
      employeeId: null,
      locationId: null,
      status: "active",
    },
    orderBy: { updatedAt: "desc" },
    // Puffer, weil die ACL-Filterung Einträge entfernen kann.
    take: limit * 3,
    include: {
      parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } },
    },
  });

  const folderAcl = await loadTenantFolderAcl(tenant.tenantId);

  return records
    .filter((file) => canAccessFileAcl(file.parent ?? file, tenant))
    .filter((file) => file.teamId || !isFolderPathDenied(folderAcl, file.folderSlug, tenant))
    .slice(0, limit)
    .map(mapTenantFileToFileItem);
}

export async function getFileUploadOptions(
  tenantSlug: string,
): Promise<FileUploadOptions> {
  const tenant = await requireTenantAccess(tenantSlug, "files", "read");

  const [employees, locations, roles, memberships, teams] = await Promise.all([
    prisma.tenantEmployee.findMany({
      where: { tenantId: tenant.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.tenantLocation.findMany({
      where: { tenantId: tenant.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.tenantRole.findMany({
      where: { tenantId: tenant.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.tenantMembership.findMany({
      where: { tenantId: tenant.tenantId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.tenantTeam.findMany({
      where: { tenantId: tenant.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return {
    employees,
    locations,
    roles,
    teams,
    users: memberships.map((membership) => ({
      id: membership.user.id,
      name: membership.user.name || membership.user.email,
    })),
  };
}

function getReminderFileSource(record: {
  employeeId: string | null;
  locationId: string | null;
  teamId: string | null;
}): ReminderFileBrowserSource {
  if (record.employeeId) {
    return "employee";
  }

  if (record.locationId) {
    return "location";
  }

  if (record.teamId) {
    return "team";
  }

  return "central";
}

function getReminderFileOwner(record: {
  employeeId: string | null;
  locationId: string | null;
  teamId: string | null;
  employee?: { name: string } | null;
  location?: { name: string } | null;
  team?: { name: string } | null;
}) {
  if (record.employeeId) {
    return {
      ownerId: record.employeeId,
      ownerName: record.employee?.name ?? "Mitarbeiter",
    };
  }

  if (record.locationId) {
    return {
      ownerId: record.locationId,
      ownerName: record.location?.name ?? "Standort",
    };
  }

  if (record.teamId) {
    return {
      ownerId: record.teamId,
      ownerName: record.team?.name ?? "Team",
    };
  }

  return {
    ownerId: "central",
    ownerName: "Zentral",
  };
}

export async function getReminderFileBrowserData(
  tenantSlug: string,
): Promise<ReminderFileBrowserData> {
  const tenant = await requireTenantAccess(tenantSlug, "files", "read");

  const [files, folders] = await Promise.all([
    prisma.tenantFile.findMany({
      where: { tenantId: tenant.tenantId, status: "active" },
      orderBy: { updatedAt: "desc" },
      include: {
        employee: { select: { name: true } },
        location: { select: { name: true } },
        team: { select: { name: true } },
        parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } },
      },
    }),
    prisma.tenantFileFolder.findMany({
      where: { tenantId: tenant.tenantId, status: "active" },
      orderBy: { name: "asc" },
      include: {
        employee: { select: { name: true } },
        location: { select: { name: true } },
        team: { select: { name: true } },
      },
    }),
  ]);

  const aclFilteredFiles = files.filter((file) => canAccessFileAcl(file.parent ?? file, tenant));

  // Wie in `getOwnerFiles`: diese Liste umfasst ALLE aktiven Dateien des
  // Mandanten, nicht nur zentrale — ohne Fachbereichsprüfung sah ein
  // Aufrufer mit generischem "files:read" hier auch Personalakten-Dateien
  // außerhalb seiner Fachbereichs-Berechtigung (Audit-Finding H15).
  const areaAccessAllowed: boolean[] = [];
  for (const file of aclFilteredFiles) {
    try {
      await requireTenantFileAreaAccess(tenant, file);
      areaAccessAllowed.push(true);
    } catch {
      areaAccessAllowed.push(false);
    }
  }

  const browserFiles = aclFilteredFiles
    .filter((_file, index) => areaAccessAllowed[index])
    .map((file) => {
      const owner = getReminderFileOwner(file);
      const item = mapTenantFileToFileItem(file);

      return {
        id: file.id,
        name: item.name,
        type: item.type,
        source: getReminderFileSource(file),
        ownerId: owner.ownerId,
        ownerName: owner.ownerName,
        folderSlug: file.folderSlug,
        folderName: file.folderName,
        updatedAt: item.updatedAt,
        size: item.size,
      };
    });

  // Ordner durchliefen bisher KEINE Fachbereichsprüfung — anders als Dateien
  // gaben sie Namen/Owner tenantweit preis, auch aus Bereichen ohne
  // ausreichendes Fachrecht (z. B. Personalakten-Ordner ohne employeeFiles-
  // Zugriff) oder als "vor dem Mitarbeiter verborgen" markiert
  // (Audit-Finding H15).
  const folderAreaAccessAllowed: boolean[] = [];
  for (const folder of folders) {
    try {
      await requireTenantFileAreaAccess(tenant, folder);
      folderAreaAccessAllowed.push(true);
    } catch {
      folderAreaAccessAllowed.push(false);
    }
  }

  const browserFolders = folders
    .filter((_folder, index) => folderAreaAccessAllowed[index])
    .map((folder) => {
      const owner = getReminderFileOwner(folder);
      const source = getReminderFileSource(folder);

      return {
        id: folder.id,
        name: folder.name,
        path: folder.path,
        source,
        ownerId: owner.ownerId,
        ownerName: owner.ownerName,
        fileCount: browserFiles.filter(
          (file) =>
            file.source === source &&
            file.ownerId === owner.ownerId &&
            file.folderSlug === folder.path,
        ).length,
      };
    });

  return {
    files: browserFiles,
    folders: browserFolders,
  };
}

/**
 * Übersetzt den "files"-Scope (own/team/all) für das eigenständige
 * Dateien-Modul in einen zusätzlichen `where`-Filter auf `uploadedById`.
 * "own" zeigt nur selbst hochgeladene Dateien, "team" nur Dateien, die von
 * jemandem aus dem eigenen Team hochgeladen wurden (analog zum "team"-Scope
 * anderer Bereiche — Namensabgleich über die eigene Personalakte). Team-
 * *gebundene* Dateien (TenantFile.teamId, z. B. über die Team-Detailseite
 * hochgeladen) laufen separat über `team-service.ts` und werden hier
 * bewusst ausgeklammert (employeeId/locationId/teamId alle null), analog zum
 * bestehenden Verhalten für Personalakte-/Standort-Dateien.
 */
/**
 * Kombiniert den Uploader-Scope mit den ausdrücklich geteilten Dateien.
 *
 * Ohne das versteckte "nur eigene"/"Team" auch jene Dateien, die jemandem
 * gezielt freigegeben wurden (`accessUserIds`/`accessRoleIds` im Upload-
 * Dialog): Ordner sind nicht scope-gefiltert, die Dateien darin schon — in
 * der App waren die Ordner also da und blieben leer. Eine ausdrückliche
 * Freigabe ist die stärkere Aussage und hebt den Uploader-Scope für genau
 * diese Datei auf; die ACL-Prüfung (`canAccessFileAcl`) läuft danach
 * unverändert weiter.
 */
function filesVisibilityWhere(
  uploaderScopeWhere: Record<string, unknown>,
  tenant: Awaited<ReturnType<typeof requireTenantAccess>>,
) {
  if (Object.keys(uploaderScopeWhere).length === 0) {
    return {};
  }

  return {
    OR: [
      uploaderScopeWhere,
      { accessUserIdsJson: { array_contains: [tenant.userId] } },
      ...(tenant.roleId ? [{ accessRoleIdsJson: { array_contains: [tenant.roleId] } }] : []),
    ],
  };
}

async function filesUploaderScopeWhere(tenant: Awaited<ReturnType<typeof requireTenantAccess>>) {
  const scopeFilter = await resolveScopeFilter(tenant);

  if (scopeFilter.type === "own") {
    return { uploadedById: tenant.userId };
  }

  if (scopeFilter.type === "team") {
    const teammates = await prisma.tenantEmployee.findMany({
      where: { tenantId: tenant.tenantId, id: { in: scopeFilter.teammateIds }, userId: { not: null } },
      select: { userId: true },
    });
    const teammateUserIds = teammates
      .map((employee) => employee.userId)
      .filter((id): id is string => Boolean(id));

    return { uploadedById: { in: teammateUserIds.length ? teammateUserIds : ["__none__"] } };
  }

  return {};
}

export type OwnerScopedFileOwnerType = "employee" | "location" | "team";

/**
 * Antwortform der owner-skopierten Dateiliste. Bewusst nicht `FileItem`:
 * dessen `updatedAt`/`size` sind bereits deutsch formatierte Anzeigetexte,
 * während ein API-Client ISO-Datum und Bytes braucht.
 */
export type OwnerFileItem = {
  id: string;
  name: string;
  documentType: string;
  description?: string;
  folder: string;
  /** Leerer String = kein Ordner ("Home"). Zum Gruppieren gegen `OwnerFolderItem.slug` matchen. */
  folderSlug: string;
  sizeBytes: number;
  mimeType: string;
  /** ISO-8601 */
  updatedAt: string;
  version: number;
  /** Nur bei `ownerType: "employee"` bedeutsam: vor dem Mitarbeiter selbst verborgen. */
  hiddenFromEmployee: boolean;
};

export type OwnerFolderItem = {
  id: string;
  name: string;
  /** Vollständiger Ordnerpfad (mehrstufig, `/`-getrennt) — Schlüssel der Navigation. */
  slug: string;
  locked: boolean;
  fileCount: number;
  /** ISO-8601 */
  updatedAt: string;
  /** Nur bei `ownerType: "employee"` bedeutsam: Ordner samt Inhalt vor dem Mitarbeiter selbst verborgen. */
  hiddenFromEmployee: boolean;
};

/**
 * Dateien, die an einem Mitarbeiter/Standort/Team hängen — die Gegenrichtung
 * zu `getFilesPageData`, das ausdrücklich **nur** die zentrale Ablage
 * (employeeId/locationId/teamId alle null) liefert. Ohne diese Funktion
 * bekäme ein Client, der `ownerType`/`ownerId` mitschickt, still die zentrale
 * Ablage zurück statt der Akte, die er angefragt hat.
 *
 * Rechte wie beim Upload derselben Dateien (storage.service.ts): `files:read`
 * **und** Leserecht im Fachbereich des Eigentümers, dazu Datei-ACL und der
 * `files`-Scope auf den Uploader.
 *
 * Liefert zusätzlich die (flache, nicht verschachtelte) Ordnerliste dieses
 * Eigentümers — Dateien werden weiterhin ungefiltert als eine flache Liste
 * zurückgegeben (mit `folderSlug` zum clientseitigen Gruppieren), analog zu
 * `getFilesPageData().files`, das ebenfalls unabhängig vom aktuell
 * angezeigten Ordner immer die volle Liste liefert — der eigentliche
 * PIN-Schutz greift beim Herunterladen (`signed-url`-Route), nicht bereits
 * beim Auflisten.
 */
export async function getOwnerFiles(input: {
  tenantSlug: string;
  ownerType: OwnerScopedFileOwnerType;
  ownerId: string;
}): Promise<{ files: OwnerFileItem[]; folders: OwnerFolderItem[] }> {
  const tenant = await requireTenantAccess(input.tenantSlug, "files", "read");
  const area =
    input.ownerType === "employee"
      ? "employees"
      : input.ownerType === "location"
        ? "locations"
        : "teams";

  const ownerAreaAccess = await requireTenantAccess(input.tenantSlug, area, "read");

  // "employees/locations/teams:read" allein autorisiert nur den Bereich
  // generell, nicht den konkreten `ownerId` — ein team-/own-gescopter
  // Aufrufer konnte bisher über eine bekannte fremde ID trotzdem Datei-/
  // Ordner-Metadaten (Name, Dokumentart, Ordnername, hiddenFromEmployee)
  // außerhalb seines Scopes sehen (Audit-Finding H15).
  if (input.ownerType === "employee") {
    await assertEmployeeInScope(ownerAreaAccess, input.ownerId);
  } else if (input.ownerType === "location") {
    await assertLocationInScope(ownerAreaAccess, input.ownerId);
  } else {
    await assertTeamInScope(ownerAreaAccess, input.ownerId);
  }

  const ownerFilter = {
    employeeId: input.ownerType === "employee" ? input.ownerId : undefined,
    locationId: input.ownerType === "location" ? input.ownerId : undefined,
    teamId: input.ownerType === "team" ? input.ownerId : undefined,
  };

  const uploaderScopeWhere = await filesUploaderScopeWhere(tenant);
  const [records, folderRecords] = await Promise.all([
    prisma.tenantFile.findMany({
      where: {
        tenantId: tenant.tenantId,
        ...ownerFilter,
        status: "active",
        ...filesVisibilityWhere(uploaderScopeWhere, tenant),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } },
      },
    }),
    // Alle Ebenen, nicht nur die oberste: die App navigiert über
    // `slug` (= Ordnerpfad) auch in Unterordner.
    prisma.tenantFileFolder.findMany({
      where: {
        tenantId: tenant.tenantId,
        ...ownerFilter,
        status: "active",
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const aclFilteredRecords = records.filter((file) => canAccessFileAcl(file.parent ?? file, tenant));

  // Datei-ACL allein sagt nichts über den fachlichen Bereich aus (payroll/
  // contracts/sickness/employeeFiles) — ohne diese Zweitprüfung sah ein
  // Aufrufer mit generischem "files:read" bislang auch Metadaten von
  // Personalakten-Dateien außerhalb seiner Fachbereichs-Berechtigung
  // (Audit-Finding H15), analog zu `getTenantFileSignedUrl`.
  const areaAccessAllowed: boolean[] = [];
  for (const file of aclFilteredRecords) {
    try {
      await requireTenantFileAreaAccess(tenant, file);
      areaAccessAllowed.push(true);
    } catch {
      areaAccessAllowed.push(false);
    }
  }

  const files = aclFilteredRecords
    .filter((_file, index) => areaAccessAllowed[index])
    .map((file) => ({
      id: file.id,
      name: file.displayName || file.originalName,
      documentType: file.documentType || "Sonstiges",
      description: file.description || undefined,
      folder: file.folderName,
      folderSlug: file.folderSlug,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
      updatedAt: (file.updatedAt ?? file.createdAt).toISOString(),
      version: file.version,
      hiddenFromEmployee: file.hiddenFromEmployee,
    }));

  // Wie bei Dateien oben: dieselbe Fachbereichs-/Sichtbarkeitsprüfung, statt
  // sich allein auf den bereits geprüften `ownerFilter` zu verlassen — greift
  // insbesondere `hiddenFromEmployee`, falls der Aufrufer selbst der
  // betroffene Mitarbeiter ist (Audit-Finding H15).
  const folderAreaAccessAllowed: boolean[] = [];
  for (const folder of folderRecords) {
    try {
      await requireTenantFileAreaAccess(tenant, folder);
      folderAreaAccessAllowed.push(true);
    } catch {
      folderAreaAccessAllowed.push(false);
    }
  }

  const folders = folderRecords
    .filter((_folder, index) => folderAreaAccessAllowed[index])
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      slug: folder.path,
      locked: folder.locked,
      fileCount: files.filter((file) => file.folderSlug === folder.path).length,
      updatedAt: (folder.updatedAt ?? folder.createdAt).toISOString(),
      hiddenFromEmployee: folder.hiddenFromEmployee,
    }));

  return { files, folders };
}

/**
 * `t` fehlt beim Aufruf aus `GET /api/tenants/[tenant]/files` (keine next-intl-
 * Übersetzung dort) — Default liefert dieselben deutschen Texte wie vor der
 * i18n-Umstellung, damit sich diese API-Antwort für die App nicht ändert.
 */
const defaultFileMetricLabels: Record<string, string> = {
  metricFoldersLabel: "Ordner",
  metricFoldersCaption: "strukturierte Ablage",
  metricFilesLabel: "Dateien",
  metricFilesCaption: "aktive Dateien",
  metricProtectedLabel: "Geschützt",
  metricProtectedCaption: "eingeschränkte Zugriffe",
  metricUploadsLabel: "Uploads",
  metricUploadsCaption: "aus Storage",
};

export async function getFilesPageData(
  tenantSlug: string,
  path: string[] = [],
  t: (key: string) => string = (key) => defaultFileMetricLabels[key] ?? key,
) {
  const tenant = await requireTenantAccess(tenantSlug, "files", "read");
  const uploaderScopeWhere = await filesUploaderScopeWhere(tenant);
  const tenantFileRecords = await prisma.tenantFile.findMany({
        where: {
          tenantId: tenant.tenantId,
          employeeId: null,
          locationId: null,
          teamId: null,
          status: "active",
          ...filesVisibilityWhere(uploaderScopeWhere, tenant),
        },
        orderBy: { updatedAt: "desc" },
        include: {
          parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } },
        },
      });
  const allTenantFolders: TenantFileFolderRecord[] = await prisma.tenantFileFolder.findMany({
        where: {
          tenantId: tenant.tenantId,
          employeeId: null,
          locationId: null,
          teamId: null,
          scope: "tenant",
          status: "active",
        },
        orderBy: { name: "asc" },
      });
  // Rollen-Einschränkung der Ordner (M1): gesperrte Ordner samt Inhalt und
  // Unterordnern sind für diesen Aufrufer unsichtbar.
  const tenantFolders = allTenantFolders.filter((folder) => !isFolderPathDenied(allTenantFolders, folder.path, tenant));
  const storedFiles = tenantFileRecords
    .filter((file) => canAccessFileAcl(file.parent ?? file, tenant))
    .filter((file) => !isFolderPathDenied(allTenantFolders, file.folderSlug, tenant))
    .map(mapTenantFileToFileItem);
  const uploadOptions = await getFileUploadOptions(tenantSlug);
  const activeFile =
    path.length === 1
      ? storedFiles.find(
          (file) => file.folderSlug === "" && file.slug === path[0],
        )
      : path.length >= 2
        ? storedFiles.find(
            (file) =>
              file.folderSlug === path.slice(0, -1).join("/") &&
              file.slug === path.at(-1),
          )
        : undefined;
  const currentFolderPath =
    !activeFile && path.length > 0 && !path.at(-1)?.includes(".")
      ? path.join("/")
      : "";
  const activeFolderRecord = currentFolderPath
    ? tenantFolders.find((folder) => folder.path === currentFolderPath)
    : undefined;
  const toFileFolder = (folder: TenantFileFolderRecord): FileFolder & { path: string } => ({
    slug: folder.path,
    path: folder.path,
    name: folder.name,
    owner: folder.ownerName,
    updatedAt: formatUpdatedAt(folder.updatedAt ?? folder.createdAt),
    locked: folder.locked,
    fileCount: storedFiles.filter((file) => file.folderSlug === folder.path).length,
    id: folder.id,
    pinned: folder.pinned,
    accessRoleIds: parseIdList(folder.accessRoleIdsJson),
    sharedWithEmployees: folder.sharedWithEmployees,
    visibleTeamIds: parseIdList(folder.visibleTeamIdsJson),
    visibleLocationIds: parseIdList(folder.visibleLocationIdsJson),
    subfolderCount: tenantFolders.filter(
      (child) => child.path.startsWith(`${folder.path}/`) && !child.path.slice(folder.path.length + 1).includes("/"),
    ).length,
  });
  const folderOptions: FileFolder[] = tenantFolders.map(toFileFolder);
  const folderMap = new Map<string, FileFolder>();
  const childPrefix = currentFolderPath ? `${currentFolderPath}/` : "";

  for (const folder of tenantFolders) {
    const isDirectChild = currentFolderPath
      ? folder.path.startsWith(childPrefix) &&
        folder.path.slice(childPrefix.length).split("/").length === 1
      : !folder.path.includes("/");

    if (!isDirectChild) {
      continue;
    }

    folderMap.set(folder.path, toFileFolder(folder));
  }

  // Angeheftete Ordner zuerst, sonst alphabetisch (wie geladen).
  const folders = Array.from(folderMap.values()).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  const activeFolder = activeFolderRecord ? toFileFolder(activeFolderRecord) : undefined;
  // Ohne geöffneten Ordner zeigt die Ansicht "Zuletzt geändert" — über ALLE
  // Ordner hinweg (storedFiles ist bereits nach `updatedAt desc` sortiert),
  // nicht nur Dateien auf Wurzelebene. Eine in einen Unterordner hochgeladene
  // Datei blieb hier bisher unsichtbar, obwohl die Dateien-Kachel sie schon
  // mitzählte (QA-Bug BUG-025).
  const visibleFiles = activeFolder
    ? storedFiles.filter((file) => file.folderSlug === activeFolder.slug)
    : storedFiles;
  const activeFileParentFolder =
    activeFile && activeFile.folderSlug
      ? tenantFolders.find((folder) => folder.path === activeFile.folderSlug)
      : undefined;
  const metrics = [
    {
      label: t("metricFoldersLabel"),
      value: folders.length.toString(),
      caption: t("metricFoldersCaption"),
    },
    {
      label: t("metricFilesLabel"),
      value: storedFiles.length.toString(),
      caption: t("metricFilesCaption"),
    },
    {
      label: t("metricProtectedLabel"),
      value: storedFiles.filter((file) => file.locked || file.storageFileId).length.toString(),
      caption: t("metricProtectedCaption"),
    },
    {
      label: t("metricUploadsLabel"),
      value: storedFiles.length.toString(),
      caption: t("metricUploadsCaption"),
    },
  ];

  return {
    activeFile,
    activeFolder,
    activeFileParentFolder: activeFileParentFolder
      ? {
          path: activeFileParentFolder.path,
          name: activeFileParentFolder.name,
          locked: activeFileParentFolder.locked,
        }
      : undefined,
    currentFolderPath,
    folderOptions,
    folders,
    files: storedFiles,
    metrics,
    uploadOptions,
    visibleFiles,
  };
}
