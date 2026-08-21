"use client";

import { Search, X } from "lucide-react";

type ListSearchBoxProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

/** Wiederverwendbares Freitext-Suchfeld für client-seitig gefilterte Listen (Teams, Standorte, Rollen, Urlaub, Dateien, Wunschfrei). */
export function ListSearchBox({
  value,
  onChange,
  placeholder = "Suchen…",
  className,
}: ListSearchBoxProps) {
  return (
    <div className={`input-wrapper ${className ?? ""}`}>
      <Search size={14} className="input-icon-left" />
      <input
        type="search"
        className={`input bg-white ${value ? "input-with-icons" : "input-with-icon-left"}`}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label="Suche zurücksetzen"
          className="input-icon-right"
          onClick={() => onChange("")}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
