"use client";

import { useEffect, useRef } from "react";

/** One abortable long poll per visible dashboard. No confidential event payloads. */
export function useLiveUpdates(tenant: string | undefined, onChange: () => void) {
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => {
    if (!tenant) return;
    let disposed = false;
    let controller: AbortController | undefined;
    let revision: string | undefined;
    let needsRefresh = true;
    const start = () => {
      if (disposed || document.hidden || controller) return;
      controller = new AbortController();
      const connection = controller;
      void (async () => {
        let failures = 0;
        while (!disposed && !connection.signal.aborted) {
          try {
            const query = revision ? `?since=${encodeURIComponent(revision)}` : "";
            const request = new AbortController();
            const abortRequest = () => request.abort();
            connection.signal.addEventListener("abort", abortRequest, { once: true });
            const timeout = setTimeout(abortRequest, 30_000);
            const response = await fetch(`/api/tenants/${encodeURIComponent(tenant)}/live${query}`, {
              signal: request.signal, cache: "no-store",
            }).finally(() => {
              clearTimeout(timeout);
              connection.signal.removeEventListener("abort", abortRequest);
            });
            if ([401, 402, 403].includes(response.status)) { callback.current(); return; }
            if (!response.ok) throw new Error("Live connection failed");
            const next = await response.json() as { revision: string };
            if (disposed || connection.signal.aborted) return;
            if (needsRefresh || next.revision !== revision) callback.current();
            needsRefresh = false;
            revision = next.revision;
            failures = 0;
          } catch {
            if (disposed || connection.signal.aborted) return;
            needsRefresh = true;
            await new Promise<void>((resolve) => {
              const done = () => { clearTimeout(timer); connection.signal.removeEventListener("abort", done); resolve(); };
              const timer = setTimeout(done, Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5)) + Math.random() * 500);
              connection.signal.addEventListener("abort", done, { once: true });
            });
          }
        }
      })();
    };
    const visibilityChanged = () => {
      if (document.hidden) {
        controller?.abort(); controller = undefined; needsRefresh = true;
      } else { callback.current(); start(); }
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    start();
    return () => {
      disposed = true;
      controller?.abort();
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [tenant]);
}
