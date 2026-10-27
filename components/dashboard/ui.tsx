/**
 * Gemeinsame Bausteine der Dashboard-Seiten im neuen Design (Kopfbereich,
 * Karten, Buttons). Effekte wie Schatten und Hover liegen als `db-*`-Klassen
 * in app/(dashboard)/dashboard.css.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function DbPageHead({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-[26px] flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow && (
          <span className="font-mono text-[10px] tracking-[0.2em] text-[#6e6e6b] uppercase">
            {eyebrow}
          </span>
        )}
        <h1 className="m-0 font-display text-[clamp(28px,3.4vw,40px)] leading-[1.05] font-semibold tracking-[-1.2px] text-ink">
          {title}
        </h1>
        {subtitle && <span className="text-[14px] text-[#6e6e6b]">{subtitle}</span>}
      </div>
      {actions && <div className="db-head-actions flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function DbCard({
  className,
  children,
  ...props
}: ComponentProps<"section">) {
  return (
    <section
      className={cx(
        "db-card box-border rounded-[16px] border border-[#ecebe7] bg-white",
        // Eigene Innenabstände (p-0, p-[18px] …) ersetzen den Standard statt mit ihm zu kollidieren.
        !/(^|\s)p-/.test(className ?? "") && "p-6",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function DbCardTitle({
  id,
  title,
  subtitle,
  action,
}: {
  id?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="m-0 font-display text-[22px] font-semibold tracking-[-0.5px]">
          {title}
        </h2>
        {subtitle && <span className="text-[13px] text-[#6e6e6b]">{subtitle}</span>}
      </div>
      {action}
    </div>
  );
}

export const ctaClass =
  "db-cta db-focus relative inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-[10px] border border-[rgba(167,142,232,0.45)] bg-ink px-[18px] py-2.5 text-[14px] font-semibold text-white no-underline disabled:cursor-default disabled:opacity-60";
export const secondaryClass =
  "db-btn2 db-focus inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-[#ecebe7] bg-[#f2f1ed] px-4 py-2.5 text-[14px] font-semibold text-ink no-underline disabled:cursor-default disabled:opacity-60";
export const smallActionClass =
  "db-act db-focus inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[9px] border border-[#ecebe7] bg-[#f2f1ed] px-3 py-[7px] text-[13px] font-medium text-ink no-underline";

export function DbCtaLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cx(ctaClass, className)} {...props} />;
}

export function DbSecondaryLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cx(secondaryClass, className)} {...props} />;
}

export function DbActionLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cx(smallActionClass, className)} {...props} />;
}

export function DbCtaButton({ className, type = "button", ...props }: ComponentProps<"button">) {
  return <button type={type} className={cx(ctaClass, className)} {...props} />;
}

export function DbSecondaryButton({ className, type = "button", ...props }: ComponentProps<"button">) {
  return <button type={type} className={cx(secondaryClass, className)} {...props} />;
}

/** Ein-/Aus-Schalter im Stil des Designs. */
export function DbSwitch({
  checked,
  className,
  ...props
}: Omit<ComponentProps<"button">, "role" | "type"> & { checked: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cx(
        "db-focus relative inline-flex h-6 w-[42px] shrink-0 cursor-pointer items-center rounded-full border-0 p-0 transition-colors disabled:cursor-default disabled:opacity-60",
        checked ? "bg-[#8b6fe0]" : "bg-[#dcdbd6]",
        className,
      )}
      {...props}
    >
      <span
        className={cx(
          "absolute top-[3px] left-[3px] size-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform",
          checked && "translate-x-[18px]",
        )}
      />
    </button>
  );
}
