import { auth } from "@/lib/auth";
import { updateTenantReminder } from "@/lib/reminders";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Erinnerung bearbeiten. `teamId` ist hier nicht änderbar (nur bei Anlage setzbar). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string; reminderId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, reminderId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-reminder-update:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    title?: string;
    dueDate?: string;
    priority?: string;
    subject?: string;
    category?: string;
    notes?: string;
    linkedFiles?: string[];
  } | null;

  if (!body?.title?.trim() || !body.dueDate?.trim()) {
    return Response.json({ error: "'title' und 'dueDate' sind erforderlich." }, { status: 400 });
  }

  try {
    const reminder = await updateTenantReminder({
      tenantSlug: tenant,
      reminderId,
      title: body.title,
      dueDate: body.dueDate,
      priority: body.priority,
      subject: body.subject,
      category: body.category,
      notes: body.notes,
      linkedFiles: body.linkedFiles,
    });

    return Response.json({ reminder });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
