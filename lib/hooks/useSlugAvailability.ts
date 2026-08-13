"use client";

import { useEffect, useState } from "react";

export type SlugAvailabilityState = "empty" | "checking" | "available" | "taken" | "error";

type Resolution = { slug: string; state: "available" | "taken" | "error" };

/**
 * Debounced Live-Check gegen `/api/tenants/slug` — von `CompanyCreateWizard`
 * (Anlege-Assistent) und der Einstellungen-Seite (Mandanten-ID ändern)
 * gemeinsam genutzt, damit beide Stellen dieselbe Prüf-/Debounce-Logik
 * haben statt sie zu duplizieren.
 *
 * `skip` markiert einen Slug (typischerweise der aktuell zugewiesene), der
 * ohne Netzwerk-Roundtrip immer als "available" gilt — sonst würde ein
 * Mandant beim Öffnen der Einstellungen sofort seine eigene, unveränderte
 * URL als "vergeben" angezeigt bekommen.
 *
 * "empty"/"checking" werden bewusst nicht per `setState` im Effekt-Body
 * gesetzt (löst sonst `react-hooks/set-state-in-effect` aus), sondern aus
 * `slug`/`skip` und dem zuletzt aufgelösten Ergebnis abgeleitet — `setState`
 * läuft nur noch im asynchronen Fetch-Callback.
 */
export function useSlugAvailability(slug: string, skip?: string): SlugAvailabilityState {
  const [resolution, setResolution] = useState<Resolution | null>(null);

  useEffect(() => {
    if (!slug || (skip && slug === skip)) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/tenants/slug?slug=${encodeURIComponent(slug)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setResolution({ slug, state: "error" });
          return;
        }

        const data = (await response.json()) as { available?: boolean };
        setResolution({ slug, state: data.available ? "available" : "taken" });
      } catch {
        if (!controller.signal.aborted) {
          setResolution({ slug, state: "error" });
        }
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [slug, skip]);

  if (!slug) {
    return "empty";
  }

  if (skip && slug === skip) {
    return "available";
  }

  if (resolution && resolution.slug === slug) {
    return resolution.state;
  }

  return "checking";
}
