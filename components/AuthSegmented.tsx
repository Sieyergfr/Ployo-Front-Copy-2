"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import SegmentedLinks from "@/components/segmented/SegmentedLinks";

export default function AuthSegmented() {
  const pathname = usePathname();
  const t = useTranslations("Auth.tabs");

  if (pathname !== "/login" && pathname !== "/register") {
    return null;
  }

  return (
    <SegmentedLinks
      links={[
        { label: t("login"), href: "/login" },
        { label: t("register"), href: "/register" },
      ]}
    />
  );
}