"use client";

import { teamColorPalette } from "@/lib/org-options";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

const teamColorOptions = teamColorPalette.map((color) => ({
  value: color.value,
  label: color.label,
  swatch: color.className,
}));

export function TeamColorButtons({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations("TeamEditControls");
  const [selectedColor, setSelectedColor] = useState(defaultValue);

  return (
    <div className="field">
      <span className="label">{t("colorMarker")}</span>
      <input type="hidden" name="color" value={selectedColor} />
      <div className="flex flex-wrap gap-2">
        {teamColorOptions.map((color) => {
          const isSelected = selectedColor === color.value;

          return (
            <button
              key={color.value}
              type="button"
              aria-label={color.label}
              title={color.label}
              className={`flex size-10 cursor-pointer items-center justify-center rounded-[9px] border transition-colors ${
                isSelected
                  ? "border-ink bg-bg"
                  : "border-border bg-white hover:border-muted"
              }`}
              onClick={() => setSelectedColor(color.value)}
            >
              <span
                className={`flex size-5 items-center justify-center rounded-full ${color.swatch}`}
              >
                {isSelected && (
                  <Check size={13} className="text-white" strokeWidth={3} />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LocationMultiSelectDropdown({
  defaultLocations,
  options,
  name = "locations",
  label,
  placeholder,
  onChange,
}: {
  defaultLocations: string[];
  options?: string[];
  /** Feldname der versteckten Inputs — mehrere Inputs mit demselben Namen, serverseitig per `formData.getAll(name)` gelesen. */
  name?: string;
  label?: string;
  /** Platzhaltertext, wenn nichts ausgewählt ist — Default passt nur für Standorte, andere Verwendungen (z. B. Teams) sollten das überschreiben. */
  placeholder?: string;
  /** Meldet die aktuelle Auswahl (z. B. für eine Vorschau). */
  onChange?: (locations: string[]) => void;
}) {
  const t = useTranslations("TeamEditControls");
  const params = useParams<{ tenant?: string }>();
  const dropdownId = useId();
  const router = useRouter();
  const awaitingCreation = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLocations, setSelectedLocations] = useState(defaultLocations);
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const locationOptions = options ?? [];
  const isTeamSelect = name === "teams";
  const createHref = params.tenant ? `/u/${encodeURIComponent(params.tenant)}/${isTeamSelect ? "teams" : "standorte"}?create=1` : null;
  const summary = useMemo(() => {
    if (selectedLocations.length === 0) {
      return placeholder ?? t("selectLocations");
    }

    return selectedLocations.join(", ");
  }, [selectedLocations, t, placeholder]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function updateDropdownRect() {
      const rect = triggerRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      setDropdownRect({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    }

    updateDropdownRect();
    window.addEventListener("resize", updateDropdownRect);
    window.addEventListener("scroll", updateDropdownRect, true);

    return () => {
      window.removeEventListener("resize", updateDropdownRect);
      window.removeEventListener("scroll", updateDropdownRect, true);
    };
  }, [isOpen]);

  useEffect(() => {
    const refreshAfterCreation = () => {
      if (document.visibilityState === "visible" && awaitingCreation.current) {
        awaitingCreation.current = false;
        router.refresh();
      }
    };
    window.addEventListener("focus", refreshAfterCreation);
    document.addEventListener("visibilitychange", refreshAfterCreation);
    return () => {
      window.removeEventListener("focus", refreshAfterCreation);
      document.removeEventListener("visibilitychange", refreshAfterCreation);
    };
  }, [router]);

  function toggleLocation(location: string) {
    const next = selectedLocations.includes(location)
      ? selectedLocations.filter((item) => item !== location)
      : [...selectedLocations, location];

    setSelectedLocations(next);
    onChange?.(next);
  }


  return (
    <div
      ref={wrapperRef}
      className="field"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;

        if (
          !event.currentTarget.contains(nextTarget) &&
          !document
            .getElementById(dropdownId)
            ?.contains(nextTarget)
        ) {
          setIsOpen(false);
        }
      }}
    >
      <span className="label">{label ?? t("locations")}</span>
      {selectedLocations.map((location) => (
        <input key={location} type="hidden" name={name} value={location} />
      ))}
      <button
        ref={triggerRef}
        type="button"
        className="input flex cursor-pointer items-center justify-between gap-3 bg-white text-left"
        aria-haspopup={locationOptions.length ? "listbox" : "dialog"}
        aria-controls={isOpen ? dropdownId : undefined}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={selectedLocations.length > 0 ? "truncate text-ink" : "text-muted"}>
          {summary}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && dropdownRect && createPortal(
        <div
          id={dropdownId}
          role={locationOptions.length ? "listbox" : "dialog"}
          aria-label={label ?? t("locations")}
          aria-multiselectable={locationOptions.length ? true : undefined}
          className="fixed top-[var(--pos-top)] left-[var(--pos-left)] w-[var(--pos-width)] z-[1200] flex max-h-60 flex-col gap-1.5 overflow-y-auto rounded-[10px] border border-border bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
          style={
            {
              "--pos-top": `${dropdownRect.top}px`,
              "--pos-left": `${dropdownRect.left}px`,
              "--pos-width": `${dropdownRect.width}px`,
            } as CSSProperties
          }
        >
          {locationOptions.length === 0 && (
            <div className="flex flex-col items-start gap-3 p-3">
              <p className="m-0 text-[13px] leading-relaxed text-muted-2">{t(isTeamSelect ? "noTeamsCreated" : "noLocationsCreated")}</p>
              {createHref && (
                <a href={createHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white no-underline hover:bg-ink-hover" onClick={() => { awaitingCreation.current = true; setIsOpen(false); }}>
                  {t("createNow")}
                  <span className="sr-only"> — {t("opensNewTab")}</span>
                </a>
              )}
            </div>
          )}
          {locationOptions.map((location) => {
            const isSelected = selectedLocations.includes(location);

            return (
              <button
                key={location}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  isSelected ? "bg-border-soft" : "hover:bg-bg"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => toggleLocation(location)}
              >
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-[6px] border ${
                    isSelected
                      ? "border-ink bg-ink text-white"
                      : "border-border bg-white text-transparent"
                  }`}
                >
                  <Check size={13} strokeWidth={3} />
                </span>
                <span className="text-[13px] font-medium text-ink">{location}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
