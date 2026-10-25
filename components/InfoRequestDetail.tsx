"use client";

import { RightDrawer } from "@/components/ActionDrawers";
import { OwnerFileActions } from "@/components/OwnerFileActions";
import type { InfoRequest, InfoRequestStatus } from "@/lib/employees";
import { CheckCircle2, Clock, FileText, MessageSquare, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

type T = ReturnType<typeof useTranslations>;

function getStatusLabels(t: T): Record<InfoRequestStatus, string> {
  return {
    open: t("statusOpen"),
    uploaded: t("statusUploaded"),
    review: t("statusReview"),
    cancelled: t("statusCancelled"),
  };
}

const statusClassNames: Record<InfoRequestStatus, string> = {
  open: "border-warning/25 bg-warning/10 text-[#7A4E00]",
  uploaded: "border-success/25 bg-success/10 text-success",
  review: "border-success/25 bg-success/10 text-success",
  cancelled: "border-border-light bg-border-soft text-muted-2",
};

const statusIcons: Record<InfoRequestStatus, ReactNode> = {
  open: <Clock size={14} />,
  uploaded: <CheckCircle2 size={14} />,
  review: <CheckCircle2 size={14} />,
  cancelled: <XCircle size={14} />,
};

/**
 * Eine Info-Anfrage als anklickbare Zeile mit Detail-Drawer.
 *
 * Bisher war die Liste rein informativ: Nachricht, Antworttext und die
 * hochgeladene Antwortdatei standen zwar in den Daten, waren im Web aber
 * nirgends zu sehen. Der Drawer zeigt genau diese Felder — die App hat dafür
 * einen eigenen Screen (app/info-request/[id].tsx).
 */
export function InfoRequestRow({
  request,
  tenant,
}: {
  request: InfoRequest;
  tenant: string;
}) {
  const t = useTranslations("InfoRequestDetail");
  const statusLabels = getStatusLabels(t);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full cursor-pointer border-t border-border-soft py-3 text-left transition-colors hover:bg-bg"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-ink">{request.title}</div>
            <div className="mt-0.5 font-mono text-[10.5px] text-muted">
              {request.requestedBy} {"·"} {request.requestedAt}
            </div>
          </div>
          <span className="rounded-[7px] bg-border-soft px-2 py-[3px] font-mono text-[10px] text-muted-2">
            {t("dueBy", { date: request.dueAt })}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(request.items?.length ?? 0) > 0 && (
            <span className="rounded-[7px] border border-border-light px-2 py-[3px] font-mono text-[10px] text-muted">
              {t("itemsProgress", {
                done: request.items!.filter((item) => item.status === "provided").length,
                total: request.items!.length,
              })}
            </span>
          )}
          {request.fileRequested && !request.items?.length && (
            <span className="rounded-[7px] border border-border-light px-2 py-[3px] font-mono text-[10px] text-muted">
              {t("fileRequested")}
            </span>
          )}
          <span
            className={`rounded-[7px] border px-2 py-[3px] font-mono text-[10px] font-semibold ${statusClassNames[request.status]}`}
          >
            {statusLabels[request.status]}
          </span>
        </div>
      </button>

      {open && (
        <RightDrawer
          title={request.title}
          eyebrow={t("infoRequestEyebrow")}
          onClose={() => setOpen(false)}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-[7px] border px-2.5 py-1 font-mono text-[11px] font-semibold ${statusClassNames[request.status]}`}
              >
                {statusIcons[request.status]}
                {statusLabels[request.status]}
              </span>
              {request.fileRequested && (
                <span className="rounded-[7px] border border-border-light px-2.5 py-1 font-mono text-[11px] text-muted">
                  {t("fileRequested")}
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label={t("requestedByLabel")} value={request.requestedBy} />
              <DetailField label={t("requestedAtLabel")} value={request.requestedAt} />
              <DetailField label={t("dueLabel")} value={request.dueAt} />
              <DetailField
                label={t("respondedAtLabel")}
                value={request.respondedAt ?? t("noResponseYet")}
              />
            </div>

            {request.message && (
              <Block icon={<MessageSquare size={14} />} title={t("messageToEmployeeTitle")}>
                <p className="m-0 whitespace-pre-wrap text-[13px] leading-[1.55] text-ink">
                  {request.message}
                </p>
              </Block>
            )}

            {(request.items?.length ?? 0) > 0 && (
              <Block icon={<CheckCircle2 size={14} />} title={t("itemsTitle")}>
                <div className="flex flex-col">
                  {request.items!.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center gap-2 border-t border-border-soft py-2.5 first:border-t-0 first:pt-0">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[13px] font-semibold text-ink">
                          {item.label}
                          {!item.required && <span className="ml-1.5 font-normal text-muted">({t("optional")})</span>}
                        </span>
                        <span className="text-[12px] text-muted">
                          {item.kind === "document" ? t("kindDocument") : t("kindField")}
                          {item.status === "provided" && item.kind === "field" && item.value ? ` · ${item.value}` : ""}
                        </span>
                      </span>
                      {item.status === "provided" ? (
                        item.kind === "document" && item.fileId ? (
                          <OwnerFileActions tenant={tenant} storageFileId={item.fileId} name={item.fileName ?? item.label} />
                        ) : (
                          <span className="rounded-[7px] border border-success/25 bg-success/10 px-2 py-[3px] font-mono text-[10px] font-semibold text-success">
                            {t("itemProvided")}
                          </span>
                        )
                      ) : (
                        <span className="rounded-[7px] border border-warning/25 bg-warning/10 px-2 py-[3px] font-mono text-[10px] font-semibold text-[#7A4E00]">
                          {t("itemOpen")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </Block>
            )}

            <Block icon={<MessageSquare size={14} />} title={t("responseTitle")}>
              {request.responseMessage ? (
                <p className="m-0 whitespace-pre-wrap text-[13px] leading-[1.55] text-ink">
                  {request.responseMessage}
                </p>
              ) : (
                <p className="m-0 text-[13px] text-muted">
                  {request.status === "cancelled"
                    ? t("requestCancelled")
                    : t("noResponseReceived")}
                </p>
              )}
            </Block>

            {request.hasResponseFile && (
              <Block icon={<FileText size={14} />} title={t("uploadedFileTitle")}>
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                    {request.responseFileName ?? t("responseFileDefaultName")}
                  </span>
                  <OwnerFileActions
                    tenant={tenant}
                    storageFileId={request.responseFileId}
                    name={request.responseFileName ?? t("responseFileDefaultName")}
                  />
                </div>
              </Block>
            )}
          </div>
        </RightDrawer>
      )}
    </>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-soft bg-bg p-3">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">{label}</div>
      <div className="mt-1.5 text-[12.5px] font-semibold text-ink">{value}</div>
    </div>
  );
}

function Block({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg p-4">
      <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
