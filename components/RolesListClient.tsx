"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { avatarColor, levelColor } from "@/components/dashboard/roles/role-editor-state";
import { dbInputClass } from "@/components/dashboard/DbDrawer";
import { DbCard } from "@/components/dashboard/ui";
import type { RoleAssignee } from "@/lib/role-service";
import { permissionAreas, type PermissionRole } from "@/lib/roles";
import { useTranslations } from "next-intl";

function AvatarStack({ assignees }: { assignees: RoleAssignee[] }) {
  const shown = assignees.slice(0, 4);

  return (
    <span className="flex items-center">
      {shown.map((assignee) => (
        <span
          key={assignee.id}
          title={assignee.name}
          className="-ml-1.5 flex size-7 items-center justify-center rounded-full border-2 border-white text-[9.5px] font-bold text-white first:ml-0"
          style={{ background: assignee.hasAccount ? avatarColor(assignee.id) : "#b5b4af" }}
        >
          {assignee.initials}
        </span>
      ))}
      {assignees.length > shown.length && (
        <span className="-ml-1.5 flex size-7 items-center justify-center rounded-full border-2 border-white bg-[#f2f1ed] text-[10px] font-semibold text-[#6e6e6b]">
          +{assignees.length - shown.length}
        </span>
      )}
    </span>
  );
}

/** Ein Kästchen je Bereich, eingefärbt nach Stufe. */
function LevelDots({ role }: { role: PermissionRole }) {
  const t = useTranslations("RoleEditor");

  return (
    <span className="flex flex-wrap gap-[3px]" aria-hidden="true">
      {permissionAreas.map((area) => {
        const level = role.permissions[area.id] ?? "none";

        return (
          <span
            key={area.id}
            title={`${area.label}: ${t(level === "none" ? "level.noneLong" : `level.${level}`)}`}
            className="size-[10px] rounded-[2.5px]"
            style={{ background: levelColor[level] }}
          />
        );
      })}
    </span>
  );
}

export function RolesListClient({
  roles,
  assignees,
  tenant,
}: {
  roles: PermissionRole[];
  assignees: Record<string, RoleAssignee[]>;
  tenant: string;
}) {
  const t = useTranslations("RolesListClient");
  const tEditor = useTranslations("RoleEditor");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("de");

    if (!q) {
      return roles;
    }

    return roles.filter((role) =>
      [role.name, role.description].filter(Boolean).join(" ").toLocaleLowerCase("de").includes(q),
    );
  }, [roles, query]);

  return (
    <>
      <div className="mb-3.5 flex justify-end">
        <label className="relative w-full sm:w-[340px]">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#9a9a96]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className={`${dbInputClass} bg-white pl-9`}
          />
        </label>
      </div>

      <DbCard className="overflow-hidden p-0">
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">
                  <th className="w-[33%] px-[18px] py-3.5 font-normal">{t("columnRole")}</th>
                  <th className="w-[21%] px-2 py-3.5 font-normal">{t("columnMembers")}</th>
                  <th className="px-2 py-3.5 font-normal">{t("columnDescription")}</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((role) => {
                  const people = assignees[role.id] ?? [];
                  const withAccount = people.filter((person) => person.hasAccount);
                  const pending = people.length - withAccount.length;
                  const href = `/u/${tenant}/rollen/${role.id}`;

                  return (
                    <tr key={role.id} className="db-row relative border-t border-[#ecebe7]">
                      <td className="px-[18px] py-3.5">
                        <Link href={href} className="flex flex-col gap-2 text-ink no-underline after:absolute after:inset-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[14.5px] font-semibold">{role.name}</span>
                            {role.isSystem && (
                              <span className="rounded-[6px] bg-[#f2f1ed] px-1.5 py-[2px] text-[11.5px] font-semibold text-[#3d3d3a]">
                                {t("systemRole")}
                              </span>
                            )}
                          </span>
                          <LevelDots role={role} />
                        </Link>
                      </td>
                      <td className="px-2 py-3.5">
                        <span className="flex items-center gap-2.5">
                          {withAccount.length > 0 && <AvatarStack assignees={withAccount} />}
                          <span className="flex flex-col">
                            <span className="text-[14px] font-semibold tabular-nums">{withAccount.length}</span>
                            {pending > 0 && <span className="text-[12px] text-[#9a5b00]">{t("pending", { count: pending })}</span>}
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-3.5 text-[13.5px] text-[#6e6e6b]">
                        <span className="line-clamp-2">{role.description}</span>
                      </td>
                      <td className="pr-[18px] text-right">
                        <ChevronRight size={16} className="inline text-[#9a9a96]" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-10 text-center">
            <div className="font-display text-[18px] font-semibold">{t("noResultsTitle")}</div>
            <div className="mt-1.5 text-[13px] text-[#6e6e6b]">{t("noResultsDescription")}</div>
          </div>
        )}
      </DbCard>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-[#6e6e6b]">
        {(["read", "write", "admin", "none"] as const).map((level) => (
          <span key={level} className="flex items-center gap-1.5">
            <span className="size-[9px] rounded-[2px]" style={{ background: levelColor[level] }} />
            {tEditor(level === "none" ? "level.noneLong" : `level.${level}`)}
          </span>
        ))}
        <span>· {t("legendHint")}</span>
      </div>
    </>
  );
}
