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

  const nonActionColumns = columns.filter((column) => !column.isRowAction);
  const actionColumns = columns.filter((column) => column.isRowAction);

  return (
    <section
      className={cx(
        "overflow-hidden rounded-card border border-border bg-white",
        className,
      )}
    >
      <div className="hidden overflow-x-auto md:block">
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

      {/* Mobile-Fallback: gestapelte Karten statt Querscroll-Tabelle. Erste
          Spalte (üblicherweise Name/Avatar) dient als Kartentitel ohne
          Label, weitere Spalten als Label/Wert-Paare; Aktionsspalten liegen
          außerhalb eines eventuellen Link-Wrappers (keine verschachtelten
          interaktiven Elemente). */}
      <div className="flex flex-col md:hidden">
        {rows.length > 0 ? (
          rows.map((row) => {
            const key = getRowKey(row);
            const href = getRowHref?.(row);

            const fields = (
              <div className="flex flex-col gap-2">
                {nonActionColumns.map((column, index) => (
                  <div key={column.key} className="flex items-start justify-between gap-3">
                    {index > 0 && (
                      <span className="shrink-0 pt-0.5 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
                        {column.header}
                      </span>
                    )}
                    <div
                      className={cx(
                        "min-w-0",
                        index === 0 ? "flex-1" : "text-right",
                        column.className,
                      )}
                    >
                      {column.render(row)}
                    </div>
                  </div>
                ))}
              </div>
            );

            return (
              <div
                key={key}
                className="flex items-start gap-2 border-t border-border-soft px-4 py-3.5 first:border-t-0"
              >
                {href ? (
                  <Link href={href} className="block min-w-0 flex-1 no-underline">
                    {fields}
                  </Link>
                ) : (
                  <div className="min-w-0 flex-1">{fields}</div>
                )}
                {actionColumns.length > 0 && (
                  <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                    {actionColumns.map((column) => (
                      <div key={column.key}>{column.render(row)}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="px-4 py-10 text-center text-[13px] text-muted">
            {emptyState}
          </div>
        )}
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
