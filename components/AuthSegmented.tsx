"use client";

import { usePathname } from "next/navigation";
import SegmentedLinks from "@/components/segmented/SegmentedLinks";

export default function AuthSegmented() {
  const pathname = usePathname();

  if (pathname !== "/login" && pathname !== "/register") {
    return null;
  }

  return (
    <SegmentedLinks
      links={[
        { label: "Anmelden", href: "/login" },
        { label: "Registrieren", href: "/register" },
      ]}
    />
  );
}