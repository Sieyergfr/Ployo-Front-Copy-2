"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
    links: {
        label: string;
        href: string;
    }[];
};

export default function SegmentedLinks({ links }: Props) {
    const pathname = usePathname();

    return (
        <div className="segmented mb-6">
            {links.map((link) => {
                const isActive = pathname === link.href;

                return (
                    <Link key={link.href} href={link.href}
                    className={`segmented-link segmented-item ${
                        pathname === link.href
                            ? "segmented-item-active"
                            : "segmented-item-inactive"
                    }`}>
                        {link.label}
                    </Link>
                );
            })}
        </div>
    );
}