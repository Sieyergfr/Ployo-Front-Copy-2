import { auth } from "@/lib/auth";
import { createTenantReminder, getRemindersForTenant } from "@/lib/reminders";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Offene Erinnerungen (own/team/all-Scope je nach Rolle). Erledigte tauchen hier nicht auf. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-reminders:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const reminders = await getRemindersForTenant(tenant);

    return Response.json({ reminders });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Neue Erinnerung anlegen. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-reminders-create:${session.user.id}`,
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
    teamId?: string;
  } | null;

  if (!body?.title?.trim() || !body.dueDate?.trim()) {
    return Response.json({ error: "'title' und 'dueDate' sind erforderlich." }, { status: 400 });
  }

  try {
    const reminder = await createTenantReminder({
      tenantSlug: tenant,
      title: body.title,
      dueDate: body.dueDate,
      priority: body.priority,
      subject: body.subject,
      category: body.category,
      notes: body.notes,
      linkedFiles: body.linkedFiles,
      teamId: body.teamId || undefined,
    });

    return Response.json({ reminder }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
