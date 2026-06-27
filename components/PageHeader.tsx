import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  children,
  className = "",
}: PageHeaderProps) {
  return (
    <header
      className={[
        "mb-[30px] flex flex-wrap items-end gap-y-5 gap-x-7",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="min-w-60 flex-1">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.6px] text-muted">
          {eyebrow}
        </div>
        <h1 className="m-0 font-display text-[clamp(30px,3.6vw,44px)] font-semibold leading-[1.02] tracking-[-1.2px] text-ink">
          {title}
        </h1>
        {subtitle && <div className="mt-2 text-[13px] text-muted">{subtitle}</div>}
      </div>

      {children && (
        <div className="flex flex-wrap items-center gap-2.5">{children}</div>
      )}
    </header>
  );
}
