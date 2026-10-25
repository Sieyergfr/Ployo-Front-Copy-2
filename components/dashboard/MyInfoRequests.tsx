"use client";

import { DbCard, DbCardTitle, smallActionClass } from "@/components/dashboard/ui";
import { dbInputClass } from "@/components/dashboard/DbDrawer";
import { useToast } from "@/components/Toasts";
import type { SelfServiceInfoRequest } from "@/lib/self-service";
import { Check, FileText, PenLine, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Sendet ein Formular an eine der `/api/me/info-requests/*`-Routen (dieselben wie die App). */
async function send(url: string, method: "POST" | "PATCH", form: FormData) {
  try {
    const response = await fetch(url, { method, body: form });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;

    return response.ok ? { ok: true as const } : { ok: false as const, error: data?.error ?? "" };
  } catch {
    return { ok: false as const, error: "" };
  }
}

function useSender() {
  const t = useTranslations("MyArea");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState<string | null>(null);

  return {
    pending,
    async run(key: string, url: string, method: "POST" | "PATCH", form: FormData) {
      setPending(key);
      const result = await send(url, method, form);
      setPending(null);

      if (!result.ok) {
        toast({ tone: "error", title: result.error || t("infoRequestError") });
        return false;
      }

      toast({ tone: "success", title: t("infoRequestSent") });
      router.refresh();
      return true;
    },
  };
}

function ItemRow({
  tenant,
  requestId,
  item,
  sender,
}: {
  tenant: string;
  requestId: string;
  item: NonNullable<SelfServiceInfoRequest["items"]>[number];
  sender: ReturnType<typeof useSender>;
}) {
  const t = useTranslations("MyArea");
  const [value, setValue] = useState("");
  const url = `/api/me/info-requests/${encodeURIComponent(requestId)}/items/${encodeURIComponent(item.id)}`;
  const busy = sender.pending === item.id;
  const form = () => {
    const data = new FormData();

    data.set("tenant", tenant);
    return data;
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-[#f0efeb] py-2.5 first:border-t-0">
      <span className="flex min-w-[160px] flex-1 items-center gap-2">
        {item.kind === "document" ? <FileText size={15} className="text-[#8f8f8a]" /> : <PenLine size={15} className="text-[#8f8f8a]" />}
        <span className="text-[14px] font-medium">
          {item.label}
          {!item.required && <span className="ml-1 text-[12.5px] font-normal text-[#9a9a96]">({t("optional")})</span>}
        </span>
      </span>
      {item.status === "provided" ? (
        <span className="inline-flex items-center gap-1 rounded-[7px] bg-[rgba(53,122,82,0.10)] px-2 py-[3px] text-[12px] font-semibold text-[#1f5d2c]">
          <Check size={12} strokeWidth={2.5} />
          {item.kind === "field" && item.value ? item.value : t("itemDone")}
        </span>
      ) : item.kind === "field" ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = form();

            data.set("value", value);
            if (await sender.run(item.id, url, "POST", data)) setValue("");
          }}
        >
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label={item.label}
            className={`${dbInputClass} min-h-9 py-1.5`}
            required
          />
          <button type="submit" className={smallActionClass} disabled={busy}>
            {t("itemSave")}
          </button>
        </form>
      ) : (
        <label className={`${smallActionClass} ${busy ? "opacity-60" : ""}`}>
          <Upload size={14} />
          {busy ? t("itemUploading") : t("itemUpload")}
          <input
            type="file"
            className="sr-only"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];

              if (!file) return;

              const data = form();

              data.set("file", file);
              await sender.run(item.id, url, "POST", data);
              event.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

/**
 * Offene Info-Anfragen beantworten — bisher nur in der App möglich. Bei
 * mehrteiligen Anfragen (M7) einzeln je Element, sonst wie in der App mit
 * Nachricht und optionaler Datei.
 */
export default function MyInfoRequests({ tenant, requests }: { tenant: string; requests: SelfServiceInfoRequest[] }) {
  const t = useTranslations("MyArea");
  const sender = useSender();
  const open = requests.filter((request) => request.status === "open");
  const [message, setMessage] = useState<Record<string, string>>({});
  const [file, setFile] = useState<Record<string, File | null>>({});

  if (open.length === 0) {
    return null;
  }

  return (
    <DbCard aria-labelledby="my-info-requests" className="mb-5 border-[rgba(224,123,0,0.35)]">
      <DbCardTitle id="my-info-requests" title={t("infoRequestsTitle")} subtitle={t("infoRequestsSubtitle")} />
      <div className="flex flex-col gap-3">
        {open.map((request) => (
          <div key={request.id} className="rounded-[12px] border border-[#ecebe7] bg-[#fafaf8] px-4 py-3">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[14.5px] font-semibold">{request.title}</span>
              <span className="text-[12.5px] text-[#6e6e6b]">
                {request.requestedBy}
                {request.dueAt ? ` · ${t("dueOn", { date: new Date(request.dueAt).toLocaleDateString("de-DE") })}` : ""}
              </span>
            </div>
            {request.items && request.items.length > 0 ? (
              <div className="flex flex-col">
                {request.items.map((item) => (
                  <ItemRow key={item.id} tenant={tenant} requestId={request.id} item={item} sender={sender} />
                ))}
              </div>
            ) : (
              <form
                className="flex flex-col gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const data = new FormData();

                  data.set("tenant", tenant);
                  data.set("message", message[request.id] ?? "");

                  const chosen = file[request.id];

                  if (chosen) data.set("file", chosen);

                  await sender.run(request.id, `/api/me/info-requests/${encodeURIComponent(request.id)}`, "PATCH", data);
                }}
              >
                {request.message && <p className="m-0 whitespace-pre-wrap text-[13px] text-[#3d3d3a]">{request.message}</p>}
                <textarea
                  value={message[request.id] ?? ""}
                  onChange={(event) => setMessage((current) => ({ ...current, [request.id]: event.target.value }))}
                  placeholder={t("infoRequestAnswer")}
                  aria-label={t("infoRequestAnswer")}
                  rows={2}
                  className={dbInputClass}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    aria-label={t("itemUpload")}
                    required={request.fileRequested}
                    onChange={(event) => setFile((current) => ({ ...current, [request.id]: event.target.files?.[0] ?? null }))}
                    className="text-[13px]"
                  />
                  <button type="submit" className={`${smallActionClass} ml-auto`} disabled={sender.pending === request.id}>
                    {t("infoRequestSend")}
                  </button>
                </div>
              </form>
            )}
          </div>
        ))}
      </div>
    </DbCard>
  );
}
