"use server";

import {
  assertFolderPinAccess,
  createTenantFileFolder,
  folderScope,
  getTenantFileSignedUrl,
  listTenantFileDeletions,
  resolveTenantFileFolderPath,
  restoreTenantFileDeletion,
  softDeleteTenantFile,
  softDeleteTenantFileFolder,
  uploadTenantFile,
  uploadTenantFileVersion,
  verifyTenantFileFolderPin,
  type FileOwnerType,
} from "@/lib/storage/storage.service";
import { moveTenantFile, renameTenantFile, updateTenantFolderSettings } from "@/lib/file-folder-service";
import { markFolderUnlocked } from "@/lib/folder-pin";
import { checkRateLimit } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";
import { type ActionState, withActionErrorHandling } from "@/lib/action-state";
import type { FileDeletionEntry, FileDeletionResult } from "@/lib/file-trash";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : fallback;
}

function formFile(formData: FormData, key = "file") {
  const value = formData.get(key);

  return value instanceof File ? value : null;
}

function formStrings(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function filesPath(tenant: string) {
  return `/u/${tenant}/dateien`;
}

function revalidateFileAreas(input: {
  tenant: string;
  ownerType: string;
  ownerId?: string;
  returnPath?: string;
}) {
  revalidatePath(filesPath(input.tenant));

  if (input.ownerType === "employee" && input.ownerId) {
    revalidatePath(`/u/${input.tenant}/employees/${input.ownerId}`);
  }

  if (input.ownerType === "location" && input.ownerId) {
    revalidatePath(`/u/${input.tenant}/standorte/${input.ownerId}`);
  }

  if (input.ownerType === "team" && input.ownerId) {
    revalidatePath(`/u/${input.tenant}/teams/${input.ownerId}`);
  }

  if (input.returnPath) {
    revalidatePath(input.returnPath);
  }
}

export async function uploadHrFileAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const file = formFile(formData);
    const ownerType = formString(formData, "ownerType", "tenant") as FileOwnerType;
    const ownerId = formString(formData, "ownerId") || undefined;
    const returnPath = formString(formData, "returnPath") || filesPath(tenant);

    if (!tenant || !file) {
      throw new Error("Datei konnte nicht hochgeladen werden.");
    }

    await uploadTenantFile({
      tenantSlug: tenant,
      file,
      ownerType,
      ownerId,
      folderSlug: formString(formData, "folderSlug"),
      folderName: formString(formData, "folderName"),
      ownerName: formString(formData, "ownerName"),
      documentType: formString(formData, "documentType", "Sonstiges"),
      validFrom: formString(formData, "validFrom"),
      expiresAt: formString(formData, "expiresAt"),
      reminderAt: formString(formData, "reminderAt"),
      description: formString(formData, "description"),
      tags: formString(formData, "tags")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      assignedEmployeeId: formString(formData, "assignedEmployeeId"),
      assignedLocationId: formString(formData, "assignedLocationId"),
      accessRoleIds: formStrings(formData, "accessRoleIds"),
      accessUserIds: formStrings(formData, "accessUserIds"),
    });

    revalidateFileAreas({ tenant, ownerType, ownerId, returnPath });
    redirect(returnPath);
  }, "Datei hochladen");
}

export async function createHrFolderAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const name = formString(formData, "name");
    const ownerType = formString(formData, "ownerType", "tenant") as FileOwnerType;
    const ownerId = formString(formData, "ownerId") || undefined;
    const parentPath = formString(formData, "parentPath");
    const returnPath = formString(formData, "returnPath") || filesPath(tenant);

    if (!tenant || !name) {
      throw new Error("Ordner konnte nicht erstellt werden.");
    }

    await createTenantFileFolder({
      tenantSlug: tenant,
      name,
      ownerType,
      ownerId,
      parentPath,
      ownerName: formString(formData, "ownerName"),
      locked: formData.get("locked") === "on",
      pin: formString(formData, "pin"),
    });

    revalidatePath(filesPath(tenant));
    if (ownerType === "employee" && ownerId) {
      revalidatePath(`/u/${tenant}/employees/${ownerId}`);
    }
    if (ownerType === "location" && ownerId) {
      revalidatePath(`/u/${tenant}/standorte/${ownerId}`);
    }
    if (ownerType === "team" && ownerId) {
      revalidatePath(`/u/${tenant}/teams/${ownerId}`);
    }
    revalidatePath(returnPath);
    redirect(returnPath);
  }, "Ordner erstellen");
}

/**
 * PIN-Prüfung für das Popup in den Eigentümer-Ablagen (Mitarbeiter/Standort/
 * Team) — anders als `verifyFolderPinAction` ohne `redirect`, damit der
 * Dialog offen bleiben und den Fehler anzeigen kann; bei Erfolg lädt der
 * Client selbst neu. Der Scope trennt gleichnamige Ordnerpfade
 * unterschiedlicher Eigentümer (siehe lib/folder-pin.ts).
 */
export async function unlockOwnerFolderAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = formString(formData, "tenant");
  const folderPath = formString(formData, "folderPath");
  const pin = formString(formData, "pin");
  const ownerType = formString(formData, "ownerType", "tenant") as FileOwnerType;
  const ownerId = formString(formData, "ownerId") || undefined;

  if (!tenant || !folderPath || !/^\d{6}$/.test(pin)) {
    return { error: "Bitte die 6-stellige PIN eingeben." };
  }

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return { error: "Nicht angemeldet." };
  }

  const limit = await checkRateLimit({
    key: `folder-pin:${session.user.id}:${tenant}:${folderPath}`,
    limit: 10,
    windowSeconds: 600,
  });

  if (!limit.allowed) {
    return { error: "Zu viele Versuche. Bitte später erneut probieren." };
  }

  const scope = folderScope(ownerType, ownerId);
  const isValid = await verifyTenantFileFolderPin({
    tenantSlug: tenant,
    folderPath,
    pin,
    scope,
  });

  if (!isValid) {
    return { error: "Falsche PIN." };
  }

  await markFolderUnlocked(tenant, folderPath, scope);

  return { success: true };
}

/**
 * Upload per Drag & Drop. Bewusst ohne `redirect` und ohne das große
 * Upload-Formular: hier zählt nur "Datei landet im aktuell offenen Ordner",
 * alle weiteren Metadaten lassen sich danach am Datei-Eintrag pflegen.
 * Mehrere Dateien auf einmal sind erlaubt, weil ein Drop das ohnehin liefert.
 */
export async function dropUploadFilesAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = formString(formData, "tenant");
  const ownerType = formString(formData, "ownerType", "tenant") as FileOwnerType;
  const ownerId = formString(formData, "ownerId") || undefined;
  const returnPath = formString(formData, "returnPath");
  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (!tenant || files.length === 0) {
    return { error: "Keine Datei erhalten." };
  }

  try {
    for (const file of files) {
      await uploadTenantFile({
        tenantSlug: tenant,
        file,
        ownerType,
        ownerId,
        folderSlug: formString(formData, "folderSlug"),
        folderName: formString(formData, "folderName"),
        documentType: formString(formData, "documentType", "Sonstiges"),
      });
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Upload fehlgeschlagen.",
    };
  }

  revalidateFileAreas({ tenant, ownerType, ownerId, returnPath });

  return { success: true };
}

export async function verifyFolderPinAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = formString(formData, "tenant");
  const folderPath = formString(formData, "folderPath");
  const pin = formString(formData, "pin");
  const returnPath = formString(formData, "returnPath") || filesPath(tenant);

  if (!tenant || !folderPath || !/^\d{6}$/.test(pin)) {
    return { error: "Bitte die 6-stellige PIN eingeben." };
  }

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return { error: "Nicht angemeldet." };
  }

  const limit = await checkRateLimit({
    key: `folder-pin:${session.user.id}:${tenant}:${folderPath}`,
    limit: 10,
    windowSeconds: 600,
  });

  if (!limit.allowed) {
    return { error: "Zu viele Versuche. Bitte später erneut probieren." };
  }

  const isValid = await verifyTenantFileFolderPin({ tenantSlug: tenant, folderPath, pin });

  if (!isValid) {
    return { error: "Falsche PIN." };
  }

  await markFolderUnlocked(tenant, folderPath);
  redirect(returnPath);
}

export async function uploadHrFileVersionAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const fileId = formString(formData, "fileId");
    const file = formFile(formData);
    const returnPath = formString(formData, "returnPath") || filesPath(tenant);

    if (!tenant || !fileId || !file) {
      throw new Error("Version konnte nicht hochgeladen werden.");
    }

    await uploadTenantFileVersion({
      tenantSlug: tenant,
      fileId,
      file,
    });

    revalidatePath(returnPath);
    redirect(returnPath);
  }, "Dateiversion hochladen");
}

export async function getHrFileSignedUrlAction(input: {
  tenant: string;
  fileId: string;
  version?: number;
  disposition?: "inline" | "attachment";
}) {
  // Gleicher PIN-Gate wie in files/[fileId]/signed-url/route.ts — ohne diese
  // Prüfung würde diese Server Action eine gültige Download-URL für eine
  // Datei in einem gesperrten Ordner liefern, ohne je die PIN zu verlangen.
  // Die reguläre Datei-Oberfläche zeigt diese Aktion ohnehin erst, nachdem
  // der Ordner per Cookie freigeschaltet wurde (siehe FolderPinGate) — der
  // Check hier greift nur, wenn jemand die Aktion direkt aufruft.
  const { folderPath, scope } = await resolveTenantFileFolderPath({
    tenantSlug: input.tenant,
    fileId: input.fileId,
  });

  if (folderPath) {
    await assertFolderPinAccess({ tenantSlug: input.tenant, folderPath, scope });
  }

  return getTenantFileSignedUrl({
    tenantSlug: input.tenant,
    fileId: input.fileId,
    version: input.version,
    disposition: input.disposition,
  });
}

/**
 * Löschen/Wiederherstellen ohne Formular-Redirect — die Client-Komponenten in
 * components/FileTrash.tsx rufen diese Actions direkt auf, zeigen danach
 * einen Toast mit "Rückgängig" und laden die Ansicht per `router.refresh()`
 * neu. Fehler kommen wie bei allen Actions als `error` (kuratierte Meldung
 * oder generischer Text) zurück, nie als Exception.
 */
export type FileTrashActionResult = ActionState & {
  deletion?: FileDeletionResult;
  deletions?: FileDeletionEntry[];
  restored?: { kind: "file" | "folder"; name: string; fileCount: number; folderCount: number };
};

type TrashOwner = { ownerType?: FileOwnerType; ownerId?: string };

export async function deleteFileWithUndoAction(input: {
  tenant: string;
  fileId: string;
}): Promise<FileTrashActionResult> {
  return withActionErrorHandling(async () => {
    const file = await softDeleteTenantFile({ tenantSlug: input.tenant, fileId: input.fileId });

    const result: FileTrashActionResult = {
      success: true,
      deletion: {
        batchId: file.deletionBatchId ?? "",
        kind: "file",
        name: file.displayName,
        fileCount: 1,
        folderCount: 0,
        restorableUntil: file.restorableUntil,
      },
    };

    return result;
  }, "Datei löschen");
}

export async function deleteFolderWithUndoAction(
  input: { tenant: string; path: string } & TrashOwner,
): Promise<FileTrashActionResult> {
  return withActionErrorHandling(async () => {
    const deletion = await softDeleteTenantFileFolder({
      tenantSlug: input.tenant,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      path: input.path,
    });

    const result: FileTrashActionResult = { success: true, deletion };

    return result;
  }, "Ordner löschen");
}

export async function listFileDeletionsAction(
  input: { tenant: string } & TrashOwner,
): Promise<FileTrashActionResult> {
  return withActionErrorHandling(async () => {
    const deletions = await listTenantFileDeletions({
      tenantSlug: input.tenant,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
    });

    const result: FileTrashActionResult = { success: true, deletions };

    return result;
  }, "Gelöschte Dateien laden");
}

export async function restoreFileDeletionAction(input: {
  tenant: string;
  batchId: string;
}): Promise<FileTrashActionResult> {
  return withActionErrorHandling(async () => {
    const restored = await restoreTenantFileDeletion({
      tenantSlug: input.tenant,
      batchId: input.batchId,
    });

    const result: FileTrashActionResult = { success: true, restored };

    return result;
  }, "Löschung rückgängig machen");
}

/**
 * Ordner-Einstellungen (M1). Die Felder kommen nur mit, wenn der Dialog sie
 * zeigt: `settings=access` schickt Rollen/Freigabe, sonst nur Name/Anheften.
 */
export async function updateFolderSettingsAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const path = formString(formData, "path");

    if (!tenant || !path) {
      throw new Error("Ordner konnte nicht gespeichert werden.");
    }

    const withAccess = formString(formData, "settings") === "access";
    const pinned = formString(formData, "pinned");

    await updateTenantFolderSettings({
      tenantSlug: tenant,
      path,
      name: formData.has("name") ? formString(formData, "name") : undefined,
      pinned: pinned === "true" ? true : pinned === "false" ? false : undefined,
      ...(withAccess
        ? {
            accessRoleIds: formStrings(formData, "roleId"),
            sharedWithEmployees: formData.get("sharedWithEmployees") === "on",
            visibleTeamIds: formStrings(formData, "teamId"),
            visibleLocationIds: formStrings(formData, "locationId"),
          }
        : {}),
    });

    revalidatePath(filesPath(tenant), "layout");

    return { success: true };
  }, "Ordner-Einstellungen speichern");
}

export async function renameFileAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const fileId = formString(formData, "fileId");

    if (!tenant || !fileId) {
      throw new Error("Datei konnte nicht umbenannt werden.");
    }

    await renameTenantFile({ tenantSlug: tenant, fileId, name: formString(formData, "name") });
    revalidatePath(filesPath(tenant), "layout");

    return { success: true };
  }, "Datei umbenennen");
}

export async function moveFileAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const fileId = formString(formData, "fileId");

    if (!tenant || !fileId) {
      throw new Error("Datei konnte nicht verschoben werden.");
    }

    await moveTenantFile({ tenantSlug: tenant, fileId, targetPath: formString(formData, "targetPath") });
    revalidatePath(filesPath(tenant), "layout");

    return { success: true };
  }, "Datei verschieben");
}
