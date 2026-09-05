/** Platzhalter-Balken für loading.tsx-Ansichten — pulsierend, an die Kartenfarben angelehnt. */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[8px] bg-border-soft ${className}`} />;
}

/** Kartenform wie `DashboardCard`/`.card` — Titelzeile + ein paar Zeilen Inhalt. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <section className="rounded-card border border-border bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
      <SkeletonBlock className="mb-4 h-5 w-1/3" />
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: lines }).map((_, index) => (
          <SkeletonBlock key={index} className="h-4 w-full" />
        ))}
      </div>
    </section>
  );
}

/** Grid aus Karten-Skeletten für Dashboard-/Listen-Seiten. */
export function SkeletonCardGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

/** Zeilenweise Tabellen-/Listen-Platzhalter. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-card border border-border bg-white p-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-3 py-3">
          <SkeletonBlock className="size-9 shrink-0 rounded-full" />
          <SkeletonBlock className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}
