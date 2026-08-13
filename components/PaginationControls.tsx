import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function PaginationControls({
  page,
  pageCount,
  total,
  pageSize,
  basePath,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  basePath: string;
}) {
  if (total === 0) {
    return null;
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const hrefFor = (targetPage: number) =>
    targetPage <= 1 ? basePath : `${basePath}?page=${targetPage}`;

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-3.5">
      <span className="font-mono text-[11px] text-muted">
        {from}–{to} von {total}
      </span>
      <div className="flex items-center gap-2">
        <Link
          href={hrefFor(page - 1)}
          aria-disabled={page <= 1}
          className={`inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted transition-colors ${
            page <= 1
              ? "pointer-events-none opacity-40"
              : "hover:border-border-light hover:text-ink"
          }`}
        >
          <ChevronLeft size={15} />
        </Link>
        <span className="font-mono text-[11px] text-muted">
          Seite {page} / {pageCount}
        </span>
        <Link
          href={hrefFor(page + 1)}
          aria-disabled={page >= pageCount}
          className={`inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted transition-colors ${
            page >= pageCount
              ? "pointer-events-none opacity-40"
              : "hover:border-border-light hover:text-ink"
          }`}
        >
          <ChevronRight size={15} />
        </Link>
      </div>
    </div>
  );
}
