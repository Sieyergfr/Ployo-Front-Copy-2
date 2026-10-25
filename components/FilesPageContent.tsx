import AuditLogPanel from "@/components/AuditLogPanel";
import { FilesListClient } from "@/components/FilesListClient";
import FolderPinGate from "@/components/FolderPinGate";
import { RecentlyDeletedPanel } from "@/components/FileTrash";
import { ctaClass, DbPageHead, secondaryClass } from "@/components/dashboard/ui";
import {
  CreateFolderButton,
  FileDownloadButton,
  FileSoftDeleteButton,
  FileViewButton,
  UploadFileButton,
  VersionUploadButton,
} from "@/components/FileActionButtons";
import { auth } from "@/lib/auth";
import { getTenantsForUser } from "@/lib/tenants";
import { headers } from "next/headers";
import { getAuditLogsForEntity } from "@/lib/audit";
import { getFilesPageData } from "@/lib/files-server";
import { isFolderUnlocked } from "@/lib/folder-pin";
import { getFileVersions, type FileItem } from "@/lib/files";
import { paginate, searchParamPage } from "@/lib/pagination";
import { hasPermissionLevel } from "@/lib/roles";
import { getTenantCapabilities, getTenantPermissions, withAccessRedirect } from "@/lib/tenant-access";
import { ArrowLeft, FileText, FolderPlus, Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

const PAGE_SIZE = 30;

type T = Awaited<ReturnType<typeof getTranslations>>;

function FileInfoCard({
  file,
  tenant,
  returnPath,
  canManageFiles,
  canDeleteFiles,
  t,
}: {
  file: FileItem;
  tenant: string;
  returnPath: string;
  canManageFiles: boolean;
  canDeleteFiles: boolean;
  t: T;
}) {
  const versions = getFileVersions(file);

  return (
    <section className="rounded-card border border-border bg-white px-6 py-[22px]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-border-soft text-muted-2">
            <FileText size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-display text-[22px] font-semibold tracking-[-0.4px] text-ink">
              {file.name}
            </h2>
            <div className="mt-1 font-mono text-[10.5px] text-muted">
              {file.folder} · {file.type} · {file.size} · v{file.version}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <FileViewButton file={file} tenant={tenant} />
          <FileDownloadButton file={file} tenant={tenant} label={t("currentVersionLabel")} />
          {canManageFiles && (
            <VersionUploadButton file={file} tenant={tenant} returnPath={returnPath} />
          )}
          {canDeleteFiles && (
            <FileSoftDeleteButton file={file} tenant={tenant} returnPath={returnPath} />
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [t("uploadedByLabel"), file.uploadedByName],
          [t("uploadedAtLabel"), file.uploadedAt],
          [t("documentTypeLabel"), file.documentType],
          [t("responsibleLabel"), file.owner],
          [t("updatedLabel"), file.updatedAt],
          [t("expiresAtLabel"), file.expiresAt ?? t("noExpiry")],
          [t("reminderLabel"), file.reminder ?? t("noReminder")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border-soft bg-bg p-3">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
              {label}
            </div>
            <div className="mt-1.5 text-[12.5px] font-semibold text-ink">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-bg p-4">
          <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
            {t("assignmentTitle")}
          </div>
          <div className="space-y-2 text-[12.5px] text-muted">
            <div>
              {t("employeeLabel")}{" "}
              <span className="font-semibold text-ink">
                {file.assignedEmployee ?? t("notAssigned")}
              </span>
            </div>
            <div>
              {t("locationLabel")}{" "}
              <span className="font-semibold text-ink">
                {file.assignedLocation ?? t("notAssigned")}
              </span>
            </div>
            <div>
              {t("validFromLabel")}{" "}
              <span className="font-semibold text-ink">
                {file.validFrom ?? t("notSet")}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-bg p-4">
          <div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
            <Lock size={14} />
            {t("accessRolesTitle")}
          </div>
          {file.accessRoles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {file.accessRoles.map((role) => (
                <span key={role} className="rounded-[7px] border border-border-light bg-white px-2 py-[5px] text-[11.5px] text-ink">
                  {role}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[12.5px] text-muted">{t("noRestrictedRoles")}</div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-bg p-4">
          <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
            {t("individualAccessTitle")}
          </div>
          {file.accessUsers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {file.accessUsers.map((user) => (
                <span key={user} className="rounded-[7px] border border-border-light bg-white px-2 py-[5px] text-[11.5px] text-ink">
                  {user}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[12.5px] text-muted">{t("noRestrictedUsers")}</div>
          )}
        </div>
      </div>

      {(file.description || file.tags.length > 0) && (
        <div className="mt-5 rounded-xl border border-border bg-bg p-4">
          <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
            {t("descriptionTagsTitle")}
          </div>
          {file.description && (
            <p className="text-[13px] leading-5 text-ink">{file.description}</p>
          )}
          {file.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {file.tags.map((tag) => (
                <span key={tag} className="rounded-[7px] border border-border-light bg-white px-2 py-[5px] text-[11.5px] text-muted">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-5">
        <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
          {t("versionsTitle")}
        </div>
        {versions.map((version) => (
          <div key={version.version} className="grid items-center gap-3 border-t border-border-soft py-3 sm:grid-cols-[80px_1fr_160px_auto]">
            <div className="font-mono text-[12px] font-semibold text-ink">
              v{version.version}
            </div>
            <div className="text-[12.5px] text-muted-2">{version.note}</div>
            <div className="font-mono text-[10.5px] text-muted">
              {version.uploadedBy} · {version.uploadedAt}
            </div>
            <div className="flex gap-2">
              <FileViewButton file={file} tenant={tenant} version={version} compact />
              <FileDownloadButton file={file} tenant={tenant} version={version} compact />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function FilesPageContent({
  tenant,
  path = [],
  page: pageParam,
}: {
  tenant: string;
  path?: string[];
  page?: string | string[];
}) {
  const t = await getTranslations("FilesPageContent");
  const {
    activeFile,
    activeFolder,
    activeFileParentFolder,
    currentFolderPath,
    folderOptions,
    folders,
    uploadOptions,
    visibleFiles,
  } = await withAccessRedirect(tenant, () => getFilesPageData(tenant, path, t));

  if (path.length > 0 && !activeFile && !activeFolder) {
    notFound();
  }

  const [permissions, capabilities] = await Promise.all([
    getTenantPermissions(tenant),
    getTenantCapabilities(tenant),
  ]);
  const canManageFiles = hasPermissionLevel(permissions.files, "write");
  const canDeleteFiles = capabilities.files.canDelete;
  const canManageReminders = hasPermissionLevel(permissions.reminders, "write");
  // Rollen-Einschränkung und Freigabe für Mitarbeitende (M1): nur Datei-Admins.
  const canManageAccess = hasPermissionLevel(permissions.files, "admin");
  const ui = await getTranslations("FilesUi");
  const session = await auth.api.getSession({ headers: await headers() });
  const memberships = session?.user?.id ? await getTenantsForUser(session.user.id).catch(() => null) : null;
  const tenantName = memberships?.find((item) => item.tenant.slug === tenant)?.tenant.name ?? tenant;

  const baseHref = `/u/${tenant}/dateien`;
  const filesPage = paginate(visibleFiles, searchParamPage(pageParam), PAGE_SIZE);

  if (activeFile) {
    const returnPath = activeFile.folderSlug
      ? `${baseHref}/${activeFile.folderSlug}`
      : baseHref;

    if (
      activeFileParentFolder?.locked &&
      !(await isFolderUnlocked(tenant, activeFileParentFolder.path))
    ) {
      return (
        <>
          <div className="mb-[18px]">
            <Link href={baseHref} className="btn btn-secondary btn-sm">
              <ArrowLeft size={14} />
              {t("backToStorage")}
            </Link>
          </div>
          <FolderPinGate
            tenant={tenant}
            folderPath={activeFileParentFolder.path}
            folderName={activeFileParentFolder.name}
            returnPath={returnPath}
          />
        </>
      );
    }

    const auditEntries = await getAuditLogsForEntity({
      tenantSlug: tenant,
      entityType: "file",
      entityId: activeFile.storageFileId ?? activeFile.slug,
    });

    return (
      <>
        <div className="mb-[18px]">
          <Link href={returnPath} className="btn btn-secondary btn-sm">
            <ArrowLeft size={14} />
            {activeFile.folderSlug ? t("backToFolder") : t("backToStorage")}
          </Link>
        </div>
        <FileInfoCard
          file={activeFile}
          tenant={tenant}
          returnPath={returnPath}
          canManageFiles={canManageFiles}
          canDeleteFiles={canDeleteFiles}
          t={t}
        />
        <div className="mt-4">
          <AuditLogPanel entries={auditEntries} title={t("fileAuditLogTitle")} />
        </div>
      </>
    );
  }

  if (activeFolder?.locked && !(await isFolderUnlocked(tenant, activeFolder.slug))) {
    return (
      <>
        <div className="mb-[18px]">
          <Link href={baseHref} className="btn btn-secondary btn-sm">
            <ArrowLeft size={14} />
            {t("allFolders")}
          </Link>
        </div>
        <FolderPinGate
          tenant={tenant}
          folderPath={activeFolder.slug}
          folderName={activeFolder.name}
          returnPath={`${baseHref}/${activeFolder.slug}`}
        />
      </>
    );
  }

  return (
    <>
      <DbPageHead
        eyebrow={tenantName}
        title={t("title")}
        subtitle={ui("subtitle", { company: tenantName })}
        actions={
          canManageFiles ? (
            <>
              <CreateFolderButton
                tenant={tenant}
                returnPath={activeFolder ? `${baseHref}/${currentFolderPath}` : baseHref}
                parentPath={currentFolderPath}
                className={secondaryClass}
              >
                <FolderPlus size={16} />
                {currentFolderPath ? ui("newSubfolder") : ui("newFolder")}
              </CreateFolderButton>
              <UploadFileButton
                tenant={tenant}
                returnPath={activeFolder ? `${baseHref}/${currentFolderPath}` : baseHref}
                folderSlug={activeFolder?.path ?? activeFolder?.slug}
                folderName={activeFolder?.name}
                folderOptions={folderOptions}
                uploadOptions={uploadOptions}
                className={ctaClass}
              />
            </>
          ) : undefined
        }
      />

      <FilesListClient
        folders={folders}
        tenant={tenant}
        visibleFiles={visibleFiles}
        filePageItems={filesPage.items}
        pageInfo={{
          page: filesPage.page,
          pageCount: filesPage.pageCount,
          total: filesPage.total,
          pageSize: filesPage.pageSize,
        }}
        activeFolder={activeFolder}
        currentFolderPath={currentFolderPath}
        folderOptions={folderOptions}
        uploadOptions={uploadOptions}
        baseHref={baseHref}
        canManageFiles={canManageFiles}
        canDeleteFiles={canDeleteFiles}
        canManageReminders={canManageReminders}
        canManageAccess={canManageAccess}
      />

      {canDeleteFiles && <RecentlyDeletedPanel tenant={tenant} className="mt-4" />}
    </>
  );
}
