"use client";

import { RightDrawer } from "@/components/ActionDrawers";
import { OwnerFileActions } from "@/components/OwnerFileActions";
import type { InfoRequest, InfoRequestStatus } from "@/lib/employees";
import { CheckCircle2, Clock, FileText, MessageSquare, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";

const statusLabels: Record<InfoRequestStatus, string> = {
  open: "Offen",
  uploaded: "Upload erhalten",
  review: "Antwort erhalten – zu prüfen",
  cancelled: "Storniert",
};

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
            bis {request.dueAt}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {request.fileRequested && (
            <span className="rounded-[7px] border border-border-light px-2 py-[3px] font-mono text-[10px] text-muted">
              Datei gewünscht
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
          eyebrow="Info-Anfrage"
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
                  Datei gewünscht
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Angefragt von" value={request.requestedBy} />
              <DetailField label="Angefragt am" value={request.requestedAt} />
              <DetailField label="Frist" value={request.dueAt} />
              <DetailField
                label="Beantwortet am"
                value={request.respondedAt ?? "Noch keine Antwort"}
              />
            </div>

            {request.message && (
              <Block icon={<MessageSquare size={14} />} title="Nachricht an den Mitarbeiter">
                <p className="m-0 whitespace-pre-wrap text-[13px] leading-[1.55] text-ink">
                  {request.message}
                </p>
              </Block>
            )}

            <Block icon={<MessageSquare size={14} />} title="Antwort">
              {request.responseMessage ? (
                <p className="m-0 whitespace-pre-wrap text-[13px] leading-[1.55] text-ink">
                  {request.responseMessage}
                </p>
              ) : (
                <p className="m-0 text-[13px] text-muted">
                  {request.status === "cancelled"
                    ? "Die Anfrage wurde storniert."
                    : "Noch keine Antwort eingegangen."}
                </p>
              )}
            </Block>

            {request.hasResponseFile && (
              <Block icon={<FileText size={14} />} title="Hochgeladene Datei">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                    {request.responseFileName ?? "Antwortdatei"}
                  </span>
                  <OwnerFileActions
                    tenant={tenant}
                    storageFileId={request.responseFileId}
                    name={request.responseFileName ?? "Antwortdatei"}
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
