"use client";

export function CookieSettingsLink({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      className={`cursor-pointer border-0 bg-transparent p-0 [font:inherit] text-inherit ${className ?? ""}`}
      style={style}
      onClick={() => window.dispatchEvent(new Event("ployo:open-cookie-settings"))}
    >
      Cookie-Einstellungen
    </button>
  );
}
