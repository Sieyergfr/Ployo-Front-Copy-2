"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import SearchInput from "@/components/inputs/SearchInput";

/**
 * Such- und Standortfilter der Mitarbeiterliste.
 *
 * Gefiltert wird **serverseitig** (`getEmployeesForTenant`) — diese Komponente
 * schreibt die Filter nur in die Query (`?search=`/`?location=`), woraufhin die
 * Server-Komponente mit dem passenden Ausschnitt neu rendert. Damit bleibt der
 * Zustand teilbar/bookmarkbar, und die Liste muss nicht vollständig zum
 * Browser übertragen werden, nur um dort wieder zusammengestrichen zu werden.
 */

/** Tastatureingaben werden gebündelt, damit nicht jeder Buchstabe eine Anfrage auslöst. */
const DEBOUNCE_MS = 300;

export default function EmployeeListFilters({
  locations,
  searchPlaceholder,
  searchAriaLabel,
  locationFilterLabel,
  allLocationsLabel,
}: {
  locations: string[];
  searchPlaceholder: string;
  searchAriaLabel: string;
  locationFilterLabel: string;
  allLocationsLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlSearch = searchParams.get("search") ?? "";
  const urlLocation = searchParams.get("location") ?? "";

  // Das Eingabefeld hängt am lokalen State, nicht an der URL: sonst würde der
  // Cursor bei jeder serverseitigen Aktualisierung springen.
  const [search, setSearch] = useState(urlSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Zuletzt selbst in die URL geschriebener Suchbegriff — damit lässt sich das
  // Echo der eigenen Navigation von einer echten externen Änderung
  // (Zurück-Button, Link ohne Query) unterscheiden. Bewusst State statt Ref:
  // der Wert wird beim Rendern gelesen.
  const [lastOwnWrite, setLastOwnWrite] = useState(urlSearch);
  const [seenUrlSearch, setSeenUrlSearch] = useState(urlSearch);

  // Angleich während des Renderns statt in einem Effekt — ein Effekt würde erst
  // einen Durchlauf mit veraltetem Wert zeichnen und dann erneut rendern
  // (https://react.dev/learn/you-might-not-need-an-effect).
  if (urlSearch !== seenUrlSearch) {
    setSeenUrlSearch(urlSearch);

    // Nur übernehmen, wenn die Änderung nicht vom eigenen, verzögerten
    // Navigieren stammt: sonst überschreibt die Antwort auf "an" die Zeichen,
    // die währenddessen zu "anna" weitergetippt wurden.
    if (urlSearch !== lastOwnWrite) {
      setSearch(urlSearch);
    }
  }

  const apply = (next: { search?: string; location?: string }) => {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(next)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }

    // Ein geänderter Filter macht die aktuelle Seitenzahl bedeutungslos —
    // sonst landet man nach dem Tippen auf einer leeren Seite 3.
    params.delete("page");

    const query = params.toString();

    // `replace` statt `push`: sonst liegt nach dem Tippen eines Namens für
    // jeden Zwischenstand ein Eintrag in der Verlaufsliste.
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  const onSearchChange = (value: string) => {
    setSearch(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      setLastOwnWrite(value);
      apply({ search: value });
    }, DEBOUNCE_MS);
  };

  // Ein noch offener Timer darf nach dem Aushängen nicht mehr navigieren.
  useEffect(() => () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  return (
    <>
      <SearchInput
        placeholder={searchPlaceholder}
        aria-label={searchAriaLabel}
        className="min-w-[230px] bg-white"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        data-pending={isPending ? "" : undefined}
      />

      <div className="relative">
        <select
          aria-label={locationFilterLabel}
          className="input min-w-40 cursor-pointer appearance-none bg-white pr-9 font-medium"
          value={urlLocation}
          onChange={(event) => apply({ location: event.target.value })}
        >
          <option value="">{allLocationsLabel}</option>
          {locations.map((location) => (
            <option key={location} value={location}>
              {location}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted"
        />
      </div>
    </>
  );
}
