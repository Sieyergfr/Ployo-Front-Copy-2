"use server";

import {
  completeTenantReminder,
  createTenantReminder,
  deleteTenantReminder,
  updateTenantReminder,
} from "@/lib/reminders";
import {
  acceptReminderSuggestion,
  dismissReminderSuggestion,
  rescheduleTenantReminder,
} from "@/lib/reminder-dashboard";
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

/**
 * Zusatzfelder des neuen Erinnerungs-Drawers. Nur Felder, die das Formular
 * wirklich mitschickt, werden übergeben — ältere Formulare (z. B. am
 * Dateibrowser) lassen sie so unverändert.
 */
function reminderDetails(formData: FormData) {
  const details: {
    subjectType?: string;
    subjectId?: string;
    ownerUserId?: string;
    recurrence?: string;
    remindDaysBefore?: number;
    checklist?: unknown;
  } = {};

  if (formData.has("subjectType")) {
    details.subjectType = formString(formData, "subjectType");
    details.subjectId = formString(formData, "subjectId");
  }
  if (formData.has("ownerUserId")) details.ownerUserId = formString(formData, "ownerUserId");
  if (formData.has("recurrence")) details.recurrence = formString(formData, "recurrence");
  if (formData.has("remindDaysBefore")) details.remindDaysBefore = Number(formString(formData, "remindDaysBefore", "7"));
  if (formData.has("checklist")) {
    try {
      details.checklist = JSON.parse(formString(formData, "checklist", "[]"));
    } catch {
      details.checklist = [];
    }
  }

  return details;
}

function remindersPath(tenant: string) {
  return `/u/${tenant}/erinnerungen`;
}

function revalidateReminderAreas(tenant: string, returnPath?: string) {
  revalidatePath(`/u/${tenant}`);
  revalidatePath(remindersPath(tenant));

  if (returnPath) {
    revalidatePath(returnPath);
  }
}

export async function createReminderAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const returnPath = formString(formData, "returnPath") || remindersPath(tenant);
    const title = formString(formData, "title");
    const dueDate = formString(formData, "dueDate");

    if (!tenant || !title || !dueDate) {
      throw new Error("Erinnerung konnte nicht erstellt werden.");
    }

    await createTenantReminder({
      tenantSlug: tenant,
      title,
      dueDate,
      priority: formString(formData, "priority", "normal"),
      subject: formString(formData, "subject"),
      category: formString(formData, "category", "Allgemein"),
      notes: formString(formData, "notes"),
      linkedFiles: formStrings(formData, "linkedFiles"),
      teamId: formString(formData, "teamId") || undefined,
      ...reminderDetails(formData),
    });

    revalidateReminderAreas(tenant, returnPath);
    redirect(returnPath);
  }, "Erinnerung erstellen");
}

export async function updateReminderAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const reminderId = formString(formData, "reminderId");
    const returnPath = formString(formData, "returnPath") || remindersPath(tenant);
    const title = formString(formData, "title");
    const dueDate = formString(formData, "dueDate");

    if (!tenant || !reminderId || !title || !dueDate) {
      throw new Error("Erinnerung konnte nicht aktualisiert werden.");
    }

    await updateTenantReminder({
      tenantSlug: tenant,
      reminderId,
      title,
      dueDate,
      priority: formString(formData, "priority", "normal"),
      subject: formString(formData, "subject"),
      category: formString(formData, "category", "Allgemein"),
      notes: formString(formData, "notes"),
      linkedFiles: formStrings(formData, "linkedFiles"),
      ...(formData.has("teamId") ? { teamId: formString(formData, "teamId") || null } : {}),
      ...reminderDetails(formData),
    });

    revalidateReminderAreas(tenant, returnPath);
    redirect(returnPath);
  }, "Erinnerung speichern");
}

export async function completeReminderAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const reminderId = formString(formData, "reminderId");
    const returnPath = formString(formData, "returnPath") || remindersPath(tenant);

    if (!tenant || !reminderId) {
      throw new Error("Erinnerung konnte nicht erledigt werden.");
    }

    await completeTenantReminder({ tenantSlug: tenant, reminderId });

    revalidateReminderAreas(tenant, returnPath);
    redirect(returnPath);
  }, "Erinnerung erledigen");
}

export async function deleteReminderAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const reminderId = formString(formData, "reminderId");
    const returnPath = formString(formData, "returnPath") || remindersPath(tenant);

    if (!tenant || !reminderId) {
      throw new Error("Erinnerung konnte nicht gelöscht werden.");
    }

    await deleteTenantReminder({ tenantSlug: tenant, reminderId });

    revalidateReminderAreas(tenant, returnPath);
    redirect(returnPath);
  }, "Erinnerung löschen");
}

/** Abhaken direkt in der Liste (ohne Weiterleitung). */
export async function completeReminderQuickAction(input: { tenant: string; reminderId: string }): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    await completeTenantReminder({ tenantSlug: String(input.tenant), reminderId: String(input.reminderId) });
    revalidateReminderAreas(String(input.tenant));
  }, "Erinnerung erledigen");
}

export async function rescheduleReminderAction(input: { tenant: string; reminderId: string; dueDate: string }): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    await rescheduleTenantReminder({
      tenantSlug: String(input.tenant),
      reminderId: String(input.reminderId),
      dueDate: String(input.dueDate),
    });
    revalidateReminderAreas(String(input.tenant));
  }, "Erinnerung verschieben");
}

export async function acceptReminderSuggestionAction(input: { tenant: string; key: string }): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    await acceptReminderSuggestion({ tenantSlug: String(input.tenant), key: String(input.key) });
    revalidateReminderAreas(String(input.tenant));
  }, "Vorschlag übernehmen");
}

export async function dismissReminderSuggestionAction(input: { tenant: string; key: string }): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    await dismissReminderSuggestion({ tenantSlug: String(input.tenant), key: String(input.key) });
    revalidateReminderAreas(String(input.tenant));
  }, "Vorschlag ignorieren");
}
