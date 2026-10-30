"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Hält Uhrzeit und Stundenfenster auch bei offen bleibender Übersicht aktuell. */
export default function OverviewClockRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);
  return null;
}
