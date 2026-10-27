"use server";

import {
  addTenantTeamMember,
  createTenantTeam,
  deleteTenantTeam,
  removeTenantTeamMember,
  setTenantTeamLead,
  updateTenantTeam,
  updateTenantTeamMember,
} from "@/lib/team-service";
import { type ActionState, withActionErrorHandling } from "@/lib/action-state";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : fallback;
}

function formStrings(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function teamsPath(tenant: string) {
  return `/u/${tenant}/teams`;
}

function teamPath(tenant: string, teamId: string) {
  return `${teamsPath(tenant)}/${teamId}`;
}

export async function createTeamAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const name = formString(formData, "name");

    if (!tenant || !name) {
      throw new Error("Teamname ist erforderlich.");
    }

    const team = await createTenantTeam({
      tenantSlug: tenant,
      name,
      description: formString(formData, "description"),
      locations: formStrings(formData, "locations"),
      colorClassName: formString(formData, "color", "bg-[#C9622A]"),
      leadEmployeeId: formString(formData, "lead") || undefined,
    });

    revalidatePath(teamsPath(tenant));
    redirect(teamPath(tenant, team.key));
  }, "Team erstellen");
}

export async function updateTeamAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const teamId = formString(formData, "teamId");
    const name = formString(formData, "name");

    if (!tenant || !teamId || !name) {
      throw new Error("Team konnte nicht gespeichert werden.");
    }

    const team = await updateTenantTeam({
      tenantSlug: tenant,
      teamId,
      name,
      locations: formStrings(formData, "locations"),
      colorClassName: formString(formData, "color", "bg-[#C9622A]"),
      description: formData.has("description") ? formString(formData, "description") : undefined,
    });

    revalidatePath(teamsPath(tenant));
    redirect(teamPath(tenant, team.key));
  }, "Team speichern");
}

export async function deleteTeamAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const teamId = formString(formData, "teamId");

    if (!tenant || !teamId) {
      throw new Error("Team konnte nicht gelöscht werden.");
    }

    await deleteTenantTeam({ tenantSlug: tenant, teamId });

    revalidatePath(teamsPath(tenant));
    redirect(teamsPath(tenant));
  }, "Team löschen");
}

export async function setTeamLeadAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const teamId = formString(formData, "teamId");
    const teamHandle = formString(formData, "teamHandle");
    const memberId = formString(formData, "memberId");

    if (!tenant || !teamId || !teamHandle || !memberId) {
      throw new Error("Teamleitung konnte nicht gespeichert werden.");
    }

    await setTenantTeamLead({ tenantSlug: tenant, teamId, memberId });

    revalidatePath(teamPath(tenant, teamHandle));
    redirect(`${teamPath(tenant, teamHandle)}?edit=1`);
  }, "Teamleitung speichern");
}

export async function addTeamMemberAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const teamId = formString(formData, "teamId");
    const teamHandle = formString(formData, "teamHandle");
    const employeeId = formString(formData, "employeeId");

    if (!tenant || !teamId || !teamHandle || !employeeId) {
      throw new Error("Mitarbeiter konnte nicht hinzugefügt werden.");
    }

    await addTenantTeamMember({
      tenantSlug: tenant,
      teamId,
      employeeId,
      role: formString(formData, "role"),
    });

    revalidatePath(teamPath(tenant, teamHandle));
    redirect(`${teamPath(tenant, teamHandle)}?edit=1`);
  }, "Mitarbeiter hinzufügen");
}

/**
 * Mehrere Mitarbeiter auf einmal ins Team holen — Gegenstück zum Popup mit
 * Mehrfachauswahl (components/AddTeamMembersButton.tsx). Der Einzel-Pfad
 * `addTeamMemberAction` bleibt für das Formular im Bearbeitungsmodus.
 *
 * Die Schleife bleibt bewusst All-or-nothing wie bisher: bricht ein Element
 * in der Mitte ab, sind die vorherigen bereits gespeichert (kein Rollback) —
 * nur der Absturz bei einem Fehler wird hier behoben, nicht dieses
 * Teilerfolg-Verhalten.
 */
export async function addTeamMembersAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const teamId = formString(formData, "teamId");
    const teamHandle = formString(formData, "teamHandle");
    const employeeIds = formData
      .getAll("employees")
      .filter((value): value is string => typeof value === "string" && value.trim() !== "");

    if (!tenant || !teamId || !teamHandle || employeeIds.length === 0) {
      throw new Error("Mitarbeiter konnten nicht hinzugefügt werden.");
    }

    const role = formString(formData, "role");

    for (const employeeId of employeeIds) {
      await addTenantTeamMember({ tenantSlug: tenant, teamId, employeeId, role });
    }

    revalidatePath(teamPath(tenant, teamHandle));
    redirect(teamPath(tenant, teamHandle));
  }, "Mitarbeiter hinzufügen");
}

export async function removeTeamMemberAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const teamId = formString(formData, "teamId");
    const teamHandle = formString(formData, "teamHandle");
    const memberId = formString(formData, "memberId");

    if (!tenant || !teamId || !teamHandle || !memberId) {
      throw new Error("Mitarbeiter konnte nicht entfernt werden.");
    }

    await removeTenantTeamMember({ tenantSlug: tenant, teamId, memberId });

    revalidatePath(teamPath(tenant, teamHandle));
    redirect(`${teamPath(tenant, teamHandle)}?edit=1`);
  }, "Mitarbeiter entfernen");
}

export async function updateTeamMemberAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const teamId = formString(formData, "teamId");
    const teamHandle = formString(formData, "teamHandle");
    const memberId = formString(formData, "memberId");
    const role = formString(formData, "role");

    if (!tenant || !teamId || !teamHandle || !memberId || !role) {
      throw new Error("Teamrolle konnte nicht gespeichert werden.");
    }

    await updateTenantTeamMember({
      tenantSlug: tenant,
      teamId,
      memberId,
      role,
      isLead: formData.get("isLead") === "on",
    });

    revalidatePath(teamPath(tenant, teamHandle));
    redirect(`${teamPath(tenant, teamHandle)}?edit=1`);
  }, "Teamrolle speichern");
}
