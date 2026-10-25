"use client";

import type { MouseEvent, ReactNode } from "react";

function setPointerVars(element: HTMLElement, event: MouseEvent, x: string, y: string) {
  const rect = element.getBoundingClientRect();
  element.style.setProperty(x, `${event.clientX - rect.left}px`);
  element.style.setProperty(y, `${event.clientY - rect.top}px`);
}

/**
 * Scroll-Container der Landingpage. Ein einziger Mousemove-Handler setzt die
 * CSS-Variablen für Raster-Spotlights (--hx/--hy auf .pl-hero) und das Licht
 * in Karten und Buttons (--mx/--my) — so bleiben alle Sektionen
 * Server-Komponenten.
 */
export default function LandingPointerEffects({ children }: { children: ReactNode }) {
  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as Element;

    const hero = target.closest?.<HTMLElement>(".pl-hero");
    if (hero) {
      setPointerVars(hero, event, "--hx", "--hy");
    }

    const glowing = target.closest?.<HTMLElement>(".pl-cta, .pl-card, .pl-dcard");
    if (glowing) {
      setPointerVars(glowing, event, "--mx", "--my");
    }
  }

  return (
    <div
      className="landing min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-bg font-sans text-ink"
      onMouseMove={handleMouseMove}
    >
      {children}
    </div>
  );
}
