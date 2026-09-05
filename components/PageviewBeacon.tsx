"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Meldet einen anonymen Seitenaufruf an /api/analytics/pageview — kein
 * Cookie, keine Nutzer-ID, respektiert Do-Not-Track. Nur in
 * (auth)/(legal)-Layout und der Landingpage eingehängt, nie im
 * angemeldeten Dashboard (s. lib/analytics.ts für den Umfang).
 */
export default function PageviewBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    // Ältere Firefox-Versionen legen das Flag statt auf navigator auf window.
    const legacyDoNotTrack = (window as { doNotTrack?: string }).doNotTrack;
    if (navigator.doNotTrack === "1" || legacyDoNotTrack === "1") return;

    const payload = JSON.stringify({ path: pathname });

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/pageview", payload);
    } else {
      fetch("/api/analytics/pageview", {
        method: "POST",
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }, [pathname]);

  return null;
}
