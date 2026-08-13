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

export async function createTeamAction(formData: FormData) {
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
}

export async function updateTeamAction(formData: FormData) {
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
  });

  revalidatePath(teamsPath(tenant));
  redirect(teamPath(tenant, team.key));
}

export async function deleteTeamAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const teamId = formString(formData, "teamId");

  if (!tenant || !teamId) {
    throw new Error("Team konnte nicht gelöscht werden.");
  }

  await deleteTenantTeam({ tenantSlug: tenant, teamId });

  revalidatePath(teamsPath(tenant));
  redirect(teamsPath(tenant));
}

export async function setTeamLeadAction(formData: FormData) {
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
}

export async function addTeamMemberAction(formData: FormData) {
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
}

export async function removeTeamMemberAction(formData: FormData) {
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
}

export async function updateTeamMemberAction(formData: FormData) {
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
}
