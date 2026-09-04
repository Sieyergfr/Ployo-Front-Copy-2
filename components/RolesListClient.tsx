"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import DataTable from "@/components/DataTable";
import { ListSearchBox } from "@/components/ListSearchBox";
import { type PermissionRole } from "@/lib/roles";
import { useTranslations } from "next-intl";

export function RolesListClient({ roles, tenant }: { roles: PermissionRole[]; tenant: string }) {
  const t = useTranslations("RolesListClient");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      return roles;
    }

    return roles.filter((role) =>
      [role.name, role.description].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [roles, query]);

  return (
    <>
      <ListSearchBox
        value={query}
        onChange={setQuery}
        placeholder={t("searchPlaceholder")}
        className="mb-4 max-w-[360px]"
      />

      {filtered.length > 0 ? (
        <DataTable
          minWidth={760}
          rows={filtered}
          getRowKey={(role) => role.id}
          getRowHref={(role) => `/u/${tenant}/rollen/${role.id}`}
          columns={[
            {
              key: "role",
              header: t("columnRole"),
              width: "2fr",
              render: (role) => (
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-border-soft text-muted-2">
                    <ShieldCheck size={16} />
                  </span>
                  <span className="truncate text-[13.5px] font-semibold text-ink">{role.name}</span>
                </div>
              ),
            },
            {
              key: "members",
              header: t("columnMembers"),
              width: "160px",
              render: (role) => (
                <div className="font-display text-[24px] font-semibold text-ink">{role.members}</div>
              ),
            },
            {
              key: "description",
              header: t("columnDescription"),
              width: "1.5fr",
              render: (role) => (
                <div className="truncate text-[12.5px] text-muted-2">{role.description}</div>
              ),
            },
            {
              key: "arrow",
              header: "",
              width: "80px",
              className: "flex justify-end",
              render: () => <ArrowRight size={15} className="text-muted" />,
            },
          ]}
        />
      ) : (
        <section className="rounded-card border border-border bg-white px-6 py-10 text-center">
          <div className="font-display text-[20px] font-semibold text-ink">{t("noResultsTitle")}</div>
          <div className="mt-2 text-[13px] text-muted-2">
            {t("noResultsDescription")}
          </div>
        </section>
      )}
    </>
  );
}
