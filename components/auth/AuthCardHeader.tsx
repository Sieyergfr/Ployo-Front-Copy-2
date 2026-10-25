import Image from "next/image";
import type { ReactNode } from "react";

/** Fortschritt im Passwort-zurücksetzen-Ablauf (drei Balken). */
export function AuthSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div aria-hidden="true" className="mb-7 flex justify-center gap-1.5">
      {[1, 2, 3].map((step) => (
        <span
          key={step}
          className={`h-1 w-6 rounded-full ${
            step < current
              ? "bg-ink"
              : step === current
                ? "au-step-active bg-ink"
                : "bg-ink/10"
          }`}
        />
      ))}
    </div>
  );
}

/** Kleines Pill-Label mit leuchtendem Punkt ("14 Tage kostenlos" …). */
export function AuthPill({ children }: { children: ReactNode }) {
  return (
    <span className="au-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-2">
      <span className="au-dot size-1.5 rounded-full" />
      {children}
    </span>
  );
}

/** Weiße Kachel mit dem Ployo-Logo (Anmelden). */
export function AuthLogoBadge() {
  return (
    <span className="au-logo-box flex size-12 items-center justify-center rounded-xl">
      <Image src="/logo_square_brand.svg" alt="" width={26} height={26} priority />
    </span>
  );
}

/** Violette Kachel für ein Lucide-Icon. */
export function AuthIconBadge({
  children,
  size = "md",
}: {
  children: ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <span
      className={`au-icon-badge flex items-center justify-center text-[#7a3c9c] ${
        size === "lg" ? "size-16 rounded-2xl" : "size-14 rounded-[14px]"
      }`}
    >
      {children}
    </span>
  );
}

export default function AuthCardHeader({
  badge,
  pill,
  title,
  subtitle,
}: {
  badge?: ReactNode;
  pill?: ReactNode;
  title: string;
  subtitle: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      {badge}
      {pill && <div className={badge ? "mt-[18px]" : undefined}>{pill}</div>}
      <h1
        className={`${pill ? (badge ? "mt-3.5" : "mt-[18px]") : badge ? "mt-5" : ""} font-display text-[28px] leading-[1.1] font-semibold tracking-[-0.8px] text-ink`}
      >
        {title}
      </h1>
      <p className="mt-2.5 text-[14px] leading-[1.6] text-muted-2">{subtitle}</p>
    </div>
  );
}
