import { auth } from "@/lib/auth";
import {
  getFilesPageData,
  getOwnerFiles,
  type OwnerScopedFileOwnerType,
} from "@/lib/files-server";
import {
  assertFolderPinAccess,
  folderScope,
  uploadTenantFile,
  type FileOwnerType,
} from "@/lib/storage/storage.service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);

  return typeof value === "string" ? value : fallback;
}

function isOwnerScopedType(value: string): value is OwnerScopedFileOwnerType {
  return value === "employee" || value === "location" || value === "team";
}

/**
 * Zentrale Personalakte-Dateien ("Dateien"-Modul). `path` (Query,
 * `/`-getrennt) navigiert Unterordner.
 *
 * Mit `ownerType` (`employee`|`location`|`team`) **und** `ownerId` liefert die
 * Route stattdessen die an diesen Eigentümer gehängten Dokumente als flache
 * Liste (`{ files }`) — dieselben Dateien, die `POST /files` mit denselben
 * Parametern anlegt. Ohne diesen Zweig kämen sie in der Antwort gar nicht vor,
 * weil die zentrale Ablage ausdrücklich nur Dateien ohne Eigentümer zeigt.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;
  const searchParams = new URL(request.url).searchParams;
  const pathParam = searchParams.get("path") ?? "";
  const path = pathParam.split("/").map((segment) => segment.trim()).filter(Boolean);
  const ownerType = searchParams.get("ownerType")?.trim() ?? "";
  const ownerId = searchParams.get("ownerId")?.trim() ?? "";

  const limit = await checkRateLimit({
    key: `tenant-files:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  // "tenant" ist der Default-Eigentümer und meint genau die zentrale Ablage —
  // der bleibt beim bestehenden Zweig.
  if (ownerType && ownerType !== "tenant") {
    if (!isOwnerScopedType(ownerType)) {
      return Response.json(
        { error: "'ownerType' muss 'tenant', 'employee', 'location' oder 'team' sein." },
        { status: 400 },
      );
    }

    if (!ownerId) {
      return Response.json(
        { error: "'ownerId' ist erforderlich, wenn 'ownerType' gesetzt ist." },
        { status: 400 },
      );
    }

    try {
      const { files, folders } = await getOwnerFiles({ tenantSlug: tenant, ownerType, ownerId });

      // Wird gezielt in einen bestimmten (Top-Level-)Ordner navigiert und ist
      // der gesperrt, dieselbe PIN-Pruefung wie beim zentralen Modul
      // verlangen, bevor die Antwort ausgeliefert wird -- sonst koennte man
      // einen gesperrten Mitarbeiter-/Standort-/Team-Ordner einfach durch
      // Navigieren "aufmachen", ohne je nach der PIN gefragt zu werden.
      // Ein gesperrter Ordner sperrt auch alles darunter — sonst käme man
      // über einen Unterordner am Gate vorbei.
      const folderSlug = path.join("/");
      const targetFolder = folderSlug
        ? folders.find(
            (folder) =>
              folder.locked &&
              (folder.slug === folderSlug || folderSlug.startsWith(`${folder.slug}/`)),
          ) ?? folders.find((folder) => folder.slug === folderSlug)
        : null;

      if (targetFolder?.locked) {
        const pin = request.headers.get("x-folder-pin")?.trim() || undefined;

        if (pin) {
          const pinLimit = await checkRateLimit({
            key: `folder-pin-attempt:${session.user.id}:${tenant}:${ownerType}:${ownerId}:${folderSlug}`,
            limit: 8,
            windowSeconds: 900,
          });

          if (!pinLimit.allowed) {
            return tooManyRequests(pinLimit);
          }
        }

        await assertFolderPinAccess({
          tenantSlug: tenant,
          folderPath: targetFolder.slug,
          pin,
          scope: folderScope(ownerType, ownerId),
        });
      }

      return Response.json({ files, folders });
    } catch (error) {
      return mapSelfServiceError(error);
    }
  }

  try {
    const data = await getFilesPageData(tenant, path);
    // getFilesPageData liefert Inhalt und Sperrstatus in einem — hier erst
    // nach dem Laden geprüft, damit die Web-Seite (FilesPageContent.tsx,
    // die dieselbe Funktion direkt aufruft) unverändert bleibt. Diese Route
    // ist der einzige Ort, an dem ein gesperrter Ordner ohne PIN bislang
    // trotzdem ausgeliefert wurde.
    const lockedFolder = data.activeFolder?.locked
      ? data.activeFolder
      : data.activeFileParentFolder?.locked
        ? data.activeFileParentFolder
        : null;

    if (lockedFolder) {
      const pin = request.headers.get("x-folder-pin")?.trim() || undefined;

      if (pin) {
        const pinLimit = await checkRateLimit({
          key: `folder-pin-attempt:${session.user.id}:${tenant}:${lockedFolder.path}`,
          limit: 8,
          windowSeconds: 900,
        });

        if (!pinLimit.allowed) {
          return tooManyRequests(pinLimit);
        }
      }

      await assertFolderPinAccess({ tenantSlug: tenant, folderPath: lockedFolder.path, pin });
    }

    return Response.json(data);
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Datei hochladen. `multipart/form-data`, Feld `file` Pflicht. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-files-upload:${session.user.id}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!formData || !(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Bitte eine Datei auswählen." }, { status: 400 });
  }

  const tagsRaw = formString(formData, "tags");
  const tags = tagsRaw
    ? tagsRaw.split(",").map((tag) => tag.trim()).filter(Boolean)
    : undefined;
  const accessRoleIds = formData.getAll("accessRoleIds").filter((v): v is string => typeof v === "string");
  const accessUserIds = formData.getAll("accessUserIds").filter((v): v is string => typeof v === "string");

  try {
    const uploaded = await uploadTenantFile({
      tenantSlug: tenant,
      file,
      ownerType: (formString(formData, "ownerType", "tenant") as FileOwnerType) || "tenant",
      ownerId: formString(formData, "ownerId") || undefined,
      folderSlug: formString(formData, "folderSlug") || undefined,
      folderName: formString(formData, "folderName") || undefined,
      ownerName: formString(formData, "ownerName") || undefined,
      documentType: formString(formData, "documentType") || undefined,
      validFrom: formString(formData, "validFrom") || undefined,
      expiresAt: formString(formData, "expiresAt") || undefined,
      reminderAt: formString(formData, "reminderAt") || undefined,
      description: formString(formData, "description") || undefined,
      tags,
      assignedEmployeeId: formString(formData, "assignedEmployeeId") || undefined,
      assignedLocationId: formString(formData, "assignedLocationId") || undefined,
      accessRoleIds: accessRoleIds.length > 0 ? accessRoleIds : undefined,
      accessUserIds: accessUserIds.length > 0 ? accessUserIds : undefined,
    });

    return Response.json({ file: uploaded }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
