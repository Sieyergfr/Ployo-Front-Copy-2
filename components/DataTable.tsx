import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  width?: string;
  render: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  isRowAction?: boolean;
};

type DataTableProps<T> = {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  getRowKey: (row: T) => string;
  getRowHref?: (row: T) => string;
  minWidth?: number;
  emptyState?: ReactNode;
  className?: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function DataTable<T>({
  columns,
  rows,
  getRowKey,
  getRowHref,
  minWidth = 900,
  emptyState = "Keine Eintr\u00e4ge gefunden.",
  className,
}: DataTableProps<T>) {
  const gridTemplateColumns = columns
    .map((column) => column.width ?? "1fr")
    .join(" ");
  const gridStyle: CSSProperties = { gridTemplateColumns };

  return (
    <section
      className={cx(
        "overflow-hidden rounded-card border border-border bg-white",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          <div
            className="grid gap-3.5 border-b border-border px-6 py-4 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted"
            style={gridStyle}
          >
            {columns.map((column) => (
              <div key={column.key} className={column.headerClassName}>
                {column.header}
              </div>
            ))}
          </div>

          {rows.length > 0 ? (
            rows.map((row) => {
              const key = getRowKey(row);
              const href = getRowHref?.(row);
              const rowContent = columns.map((column) => (
                <div
                  key={column.key}
                  className={cx("min-w-0", column.className)}
                >
                  {column.render(row)}
                </div>
              ));

              const rowClassName =
                "grid w-full items-center gap-3.5 border-t border-border-soft px-6 py-[13px] text-left font-sans transition-colors hover:bg-bg";

              if (href) {
                return (
                  <div key={key} className={rowClassName} style={gridStyle}>
                    {columns.map((column) => {
                      const content = (
                        <div className={cx("min-w-0", column.className)}>
                          {column.render(row)}
                        </div>
                      );

                      if (column.isRowAction) {
                        return <div key={column.key}>{content}</div>;
                      }

                      return (
                        <Link
                          key={column.key}
                          href={href}
                          className="block min-w-0 no-underline"
                        >
                          {content}
                        </Link>
                      );
                    })}
                  </div>
                );
              }

              return (
                <div key={key} className={rowClassName} style={gridStyle}>
                  {rowContent}
                </div>
              );
            })
          ) : (
            <div className="border-t border-border-soft px-6 py-10 text-center text-[13px] text-muted">
              {emptyState}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function DataTableAvatar({
  initials,
  label,
}: {
  initials: string;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-[11px]">
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
        {initials}
      </span>
      <span className="truncate text-[13.5px] font-semibold text-ink">
        {label}
      </span>
    </div>
  );
}

export function DataTableStack({
  title,
  subtitle,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[13px] text-ink">{title}</div>
      {subtitle && (
        <div className="truncate text-[11.5px] text-muted">{subtitle}</div>
      )}
    </div>
  );
}

export function DataTableBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-[7px] border border-border-light px-[9px] py-[3px] text-[11.5px] text-[#5C6B7A]">
      {children}
    </span>
  );
}

export function DataTableStatus({
  label,
  tone = "success",
}: {
  label: ReactNode;
  tone?: "success" | "muted" | "neutral";
}) {
  const toneClassName = {
    success: "text-success",
    muted: "text-muted",
    neutral: "text-muted-2",
  }[tone];
  const dotClassName = {
    success: "bg-success",
    muted: "bg-muted",
    neutral: "bg-muted-2",
  }[tone];

  return (
    <span className={cx("flex items-center gap-[7px] text-[12.5px]", toneClassName)}>
      <span className={cx("size-2 shrink-0 rounded-full", dotClassName)} />
      {label}
    </span>
  );
}
