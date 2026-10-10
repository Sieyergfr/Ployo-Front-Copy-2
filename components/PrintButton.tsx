"use client";

import { Printer } from "lucide-react";

export default function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-primary print:hidden" onClick={() => window.print()}>
      <Printer size={15} />
      {label}
    </button>
  );
}
