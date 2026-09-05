"use client";

import { updateTeamMemberAction } from "@/app/(dashboard)/u/[tenant]/teams/actions";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useActionStateWithToast } from "@/components/Toasts";
import { useUniversalPopup } from "@/components/UniversalPopup";
import type { TeamMember } from "@/lib/teams";
import { Crown, Pencil, Save } from "lucide-react";
import { useTranslations } from "next-intl";

export default function TeamRoleEditorButton({
  tenant,
  teamId,
  teamHandle,
  member,
}: {
  tenant: string;
  teamId: string;
  teamHandle: string;
  member: TeamMember;
}) {
  const t = useTranslations("TeamRoleEditorButton");
  const { openPopup, closePopup } = useUniversalPopup();
  const memberId = member.id ?? "";
  const [, formAction] = useActionStateWithToast(updateTeamMemberAction);

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm px-3"
      onClick={() =>
        openPopup({
          title: t("editTeamRole"),
          content: (
            <form className="flex flex-col gap-4" action={formAction}>
              <input type="hidden" name="tenant" value={tenant} />
              <input type="hidden" name="teamId" value={teamId} />
              <input type="hidden" name="teamHandle" value={teamHandle} />
              <input type="hidden" name="memberId" value={memberId} />
              <div className="rounded-xl border border-border bg-bg p-3">
                <div className="text-[13px] font-semibold text-ink">{member.name}</div>
                <div className="mt-0.5 text-[12px] text-muted">{member.location}</div>
              </div>
              <div className="field">
                <label htmlFor="team-role-text" className="label">
                  {t("roleInTeam")}
                </label>
                <input
                  id="team-role-text"
                  name="role"
                  className="input"
                  defaultValue={member.role}
                  placeholder={t("roleInTeamPlaceholder")}
                  required
                />
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  name="isLead"
                  className="peer sr-only"
                  defaultChecked={member.isLead}
                />
                <span className="checkbox" />
                <span className="checkbox-label">
                  <span className="inline-flex items-center gap-1.5">
                    <Crown size={13} />
                    {t("markAsTeamLead")}
                  </span>
                </span>
              </label>
              <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
                <button type="button" className="btn btn-secondary" onClick={closePopup}>
                  {t("cancel")}
                </button>
                <FormSubmitButton
                  Icon={Save}
                  pendingLabel={t("saving")}
                >
                  {t("save")}
                </FormSubmitButton>
              </div>
            </form>
          ),
        })
      }
    >
      <Pencil size={13} />
      {t("role")}
    </button>
  );
}
