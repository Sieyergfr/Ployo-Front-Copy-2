"use server";

import {
  completeTenantReminder,
  createTenantReminder,
  updateTenantReminder,
} from "@/lib/reminders";
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
