"use client";

import type { MouseEvent, ReactNode } from "react";

/**
 * Hintergrund der Auth-Seiten (Raster, Halo, Ringe). Ein einziger
 * Mousemove-Handler setzt die CSS-Variablen für das Raster-Spotlight
 * (--hx/--hy) und das Licht im Primär-Button (--mx/--my), damit die
 * Formulare selbst keine Zeiger-Logik brauchen.
 */
export default function AuthShell({ children }: { children: ReactNode }) {
  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    const root = event.currentTarget;
    const rootRect = root.getBoundingClientRect();
    root.style.setProperty("--hx", `${event.clientX - rootRect.left}px`);
    root.style.setProperty("--hy", `${event.clientY - rootRect.top}px`);

    const cta = (event.target as Element).closest?.<HTMLElement>(".btn-primary");
    if (cta) {
      const ctaRect = cta.getBoundingClientRect();
      cta.style.setProperty("--mx", `${event.clientX - ctaRect.left}px`);
      cta.style.setProperty("--my", `${event.clientY - ctaRect.top}px`);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-bg">
      <div
        className="au-shell relative flex min-h-full flex-col overflow-hidden font-sans text-ink"
        onMouseMove={handleMouseMove}
      >
        <div className="au-halo" aria-hidden="true" />
        <div className="au-grid" aria-hidden="true" />
        <div className="au-glow" aria-hidden="true" />
        <div className="au-spot" aria-hidden="true" />
        <div className="au-rings" aria-hidden="true">
          <div className="au-ring" />
          <div className="au-ring au-ring-2" />
          <div className="au-ring au-ring-3" />
        </div>
        {children}
      </div>
    </div>
  );
}
