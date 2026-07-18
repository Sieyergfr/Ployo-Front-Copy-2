"use server";

import {
  createTenantFileFolder,
  getTenantFileSignedUrl,
  softDeleteTenantFile,
  uploadTenantFile,
  uploadTenantFileVersion,
  type FileOwnerType,
} from "@/lib/storage/storage.service";
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

  if (input.returnPath) {
    revalidatePath(input.returnPath);
  }
}

export async function uploadHrFileAction(formData: FormData) {
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
}

export async function createHrFolderAction(formData: FormData) {
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
  });

  revalidatePath(filesPath(tenant));
  if (ownerType === "employee" && ownerId) {
    revalidatePath(`/u/${tenant}/employees/${ownerId}`);
  }
  if (ownerType === "location" && ownerId) {
    revalidatePath(`/u/${tenant}/standorte/${ownerId}`);
  }
  revalidatePath(returnPath);
  redirect(returnPath);
}

export async function uploadHrFileVersionAction(formData: FormData) {
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
}

export async function softDeleteHrFileAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const fileId = formString(formData, "fileId");
  const returnPath = formString(formData, "returnPath") || filesPath(tenant);

  if (!tenant || !fileId) {
    throw new Error("Datei konnte nicht geloescht werden.");
  }

  await softDeleteTenantFile({ tenantSlug: tenant, fileId });

  revalidatePath(returnPath);
  redirect(returnPath);
}

export async function getHrFileSignedUrlAction(input: {
  tenant: string;
  fileId: string;
  version?: number;
  disposition?: "inline" | "attachment";
}) {
  return getTenantFileSignedUrl({
    tenantSlug: input.tenant,
    fileId: input.fileId,
    version: input.version,
    disposition: input.disposition,
  });
}
