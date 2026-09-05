"use client";

import type { ReactNode } from "react";
import {
  addTeamMemberAction,
  deleteTeamAction,
  removeTeamMemberAction,
  setTeamLeadAction,
  updateTeamAction,
} from "@/app/(dashboard)/u/[tenant]/teams/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import FloatingEditBar from "@/components/FloatingEditBar";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useActionStateWithToast } from "@/components/Toasts";
import { Pencil, Plus, UserRoundCheck, UserRoundMinus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Team, TeamMember } from "@/lib/teams";

/**
 * Client-Wrapper um die Team-Detailseite (Server Component) — `useActionState`
 * ist nur in Client Components aufrufbar. Aufgeteilt in mehrere kleine
 * Komponenten statt einer großen, weil `updateTeamAction` und
 * `deleteTeamAction` zwei unabhängige Actions auf demselben `<form
 * id="team-edit-form">` sind (Speichern im Formular, Löschen per
 * `formAction`-Override auf einem Button, der an anderer Stelle im Baum
 * liegt) — jede braucht ihren eigenen `useActionState`, sonst würde ein
 * fehlgeschlagenes Löschen fälschlich als "Speichern"-Fehler auftauchen
 * (oder umgekehrt gar nicht erst den passenden Toast zeigen).
 */
export function TeamEditFormAndBar({
  tenant,
  teamId,
  cancelHref,
  isEditing,
  children,
}: {
  tenant: string;
  teamId: string;
  cancelHref: string;
  isEditing: boolean;
  children: ReactNode;
}) {
  const [, formAction, isPending] = useActionStateWithToast(updateTeamAction);

  return (
    <>
      <form id="team-edit-form" action={formAction}>
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="teamId" value={teamId} />
        {children}
      </form>
      {isEditing && (
        <FloatingEditBar cancelHref={cancelHref} formId="team-edit-form" isPending={isPending} />
      )}
    </>
  );
}

/** Löschen-Button (formAction-Override auf `team-edit-form`) + Bearbeiten-Link. */
export function TeamHeaderActions({
  teamName,
  teamEditHref,
  canDeleteTeam,
  canManage,
}: {
  teamName: string;
  teamEditHref: string;
  canDeleteTeam: boolean;
  canManage: boolean;
}) {
  const t = useTranslations("TeamDetailPage");
  const [, deleteFormAction] = useActionStateWithToast(deleteTeamAction);

  if (!canDeleteTeam && !canManage) {
    return null;
  }

  return (
    <div className="flex gap-2">
      {canDeleteTeam && (
        <ConfirmSubmitButton
          form="team-edit-form"
          formAction={deleteFormAction}
          className="btn btn-secondary btn-sm border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
          description={t("deleteConfirmDescription", { name: teamName })}
        >
          {t("delete")}
        </ConfirmSubmitButton>
      )}
      {canManage && (
        <Link href={teamEditHref} className="btn btn-secondary btn-sm">
          <Pencil size={14} />
          {t("edit")}
        </Link>
      )}
    </div>
  );
}

export function TeamLeaderEditorForm({ team, tenant }: { team: Team; tenant: string }) {
  const t = useTranslations("TeamDetailPage");
  const [, formAction] = useActionStateWithToast(setTeamLeadAction);

  return (
    <form action={formAction} className="mb-3.5 rounded-card border border-border bg-white px-6 py-4">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="teamId" value={team.dbId} />
      <input type="hidden" name="teamHandle" value={team.id} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label
            htmlFor="team-lead"
            className="mb-2 block font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted"
          >
            {t("editTeamLead")}
          </label>
          <div className="relative">
            <select
              id="team-lead"
              name="memberId"
              defaultValue={team.lead.id}
              className="input cursor-pointer appearance-none bg-white pr-9 font-medium"
              required
            >
              {team.members.map((member) => (
                <option key={member.id ?? member.initials} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <UserRoundCheck
              size={15}
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
            />
          </div>
        </div>

        <FormSubmitButton className="btn btn-primary" pendingLabel={t("saving")}>
          {t("saveTeamLead")}
        </FormSubmitButton>
      </div>
    </form>
  );
}

export function TeamMemberAssignmentForm({
  team,
  tenant,
  assignableEmployees,
}: {
  team: Team;
  tenant: string;
  assignableEmployees: TeamMember[];
}) {
  const t = useTranslations("TeamDetailPage");
  const [, formAction] = useActionStateWithToast(addTeamMemberAction);

  return (
    <form action={formAction} className="border-b border-border bg-bg px-6 py-4">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="teamId" value={team.dbId} />
      <input type="hidden" name="teamHandle" value={team.id} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label
            htmlFor="team-member-add"
            className="mb-2 block font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted"
          >
            {t("addMemberToTeam")}
          </label>
          <select
            id="team-member-add"
            name="employeeId"
            defaultValue=""
            className="input cursor-pointer appearance-none bg-white font-medium"
            required
          >
            <option value="" disabled>
              {t("selectEmployee")}
            </option>
            {assignableEmployees.map((employee) => (
              <option key={employee.employeeId ?? employee.initials} value={employee.employeeId}>
                {employee.name} - {employee.location}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[180px]">
          <label
            htmlFor="team-member-role"
            className="mb-2 block font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted"
          >
            {t("roleInTeam")}
          </label>
          <input
            id="team-member-role"
            name="role"
            className="input bg-white"
            defaultValue={team.name}
          />
        </div>

        <FormSubmitButton icon={<Plus size={15} strokeWidth={2} />} pendingLabel={t("adding")}>
          {t("add")}
        </FormSubmitButton>
      </div>
    </form>
  );
}

export function RemoveTeamMemberForm({
  tenant,
  team,
  member,
}: {
  tenant: string;
  team: Team;
  member: TeamMember;
}) {
  const t = useTranslations("TeamDetailPage");
  const [, formAction] = useActionStateWithToast(removeTeamMemberAction);
  const formId = member.id ? `remove-team-member-${member.id}` : undefined;

  return (
    <form id={formId} action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="teamId" value={team.dbId} />
      <input type="hidden" name="teamHandle" value={team.id} />
      <input type="hidden" name="memberId" value={member.id} />
      <ConfirmSubmitButton
        form={formId}
        className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-danger hover:text-danger"
        title={t("removeFromTeamTitle")}
        confirmLabel={t("remove")}
        description={t("removeConfirmDescription", { name: member.name, team: team.name })}
      >
        <UserRoundMinus size={14} />
        <span className="sr-only">{t("removeSrLabel", { name: member.name })}</span>
      </ConfirmSubmitButton>
    </form>
  );
}
