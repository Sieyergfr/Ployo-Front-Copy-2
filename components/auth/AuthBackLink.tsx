"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Wohin "zurück" führt, hängt von der Seite ab: Einstiegsseiten zurück zur
// Startseite, alle Schritte danach zurück zur Anmeldung.
function getTarget(pathname: string) {
  if (pathname === "/login/2fa") {
    return { href: "/login", key: "otherAccount" } as const;
  }

  if (pathname === "/forgot-password" || pathname === "/reset-password") {
    return { href: "/login", key: "backToLogin" } as const;
  }

  return { href: "/", key: "backToHome" } as const;
}

export default function AuthBackLink() {
  const pathname = usePathname();
  const t = useTranslations("Auth.shell");
  const target = getTarget(pathname);

  return (
    <Link
      href={target.href}
      className="au-link au-focus inline-flex min-h-11 items-center gap-2 rounded-[10px] px-3 py-2.5 text-[14px] font-medium text-muted-2 no-underline"
    >
      <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
      {t(target.key)}
    </Link>
  );
}
