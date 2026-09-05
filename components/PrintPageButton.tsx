"use client";

import type { ReactNode } from "react";

export default function PrintPageButton({
  children,
  className = "btn btn-secondary btn-sm no-print",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      {children}
    </button>
  );
}
