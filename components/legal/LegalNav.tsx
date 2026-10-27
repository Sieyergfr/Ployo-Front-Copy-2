"use client";

import { ArrowLeft, FileText, Mail, Shield, ScrollText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/impressum", key: "imprint", Icon: ScrollText },
  { href: "/datenschutz", key: "dataProtection", Icon: Shield },
  { href: "/agb", key: "terms", Icon: FileText },
  { href: "/kontakt", key: "contact", Icon: Mail },
] as const;

/** Seitenleiste der Rechtsseiten; Beschriftungen kommen vom Server-Layout. */
export default function LegalNav({ labels, backLabel }: { labels: Record<(typeof items)[number]["key"], string>; backLabel: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-row flex-wrap gap-1 lg:flex-col">
      {items.map(({ href, key, Icon }) => {
        const active = pathname === href;

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 items-center gap-2.5 rounded-[10px] px-3 text-[14.5px] no-underline ${
              active ? "bg-white font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,0.06)]" : "font-medium text-[#3d3d3a] hover:bg-white/60"
            }`}
          >
            <Icon size={15} />
            {labels[key]}
          </Link>
        );
      })}
      <Link href="/" className="mt-0 flex min-h-10 items-center gap-1.5 px-3 text-[13.5px] font-medium text-[#6e6e6b] no-underline hover:text-ink lg:mt-3">
        <ArrowLeft size={14} />
        {backLabel}
      </Link>
    </nav>
  );
}
