import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  cancelOwnAccountDeletion,
  getOwnScheduledDeletion,
  scheduleOwnAccountDeletion,
} from "@/lib/account-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { invalidRequestResponse } from "@/lib/api/validation";
import { headers } from "next/headers";

const scheduleDeletionSchema = z.object({
  password: z.string().min(1),
});

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-account-deletion:${session.user.id}`,
    limit: 30,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const scheduledDeletionAt = await getOwnScheduledDeletion();

    return Response.json({ scheduledDeletionAt });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/**
 * Konto zur Löschung vormerken (30 Tage Karenzzeit, s. `ACCOUNT_DELETION_GRACE_DAYS`).
 * Schlägt fehl, solange der Nutzer alleinige/r Inhaber/in eines Mandanten ist.
 * Meldet alle anderen Sitzungen ab.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-account-deletion-schedule:${session.user.id}`,
    limit: 5,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = await request.json().catch(() => null);
  const parsed = scheduleDeletionSchema.safeParse(body);

  if (!parsed.success) {
    return invalidRequestResponse(parsed.error);
  }

  try {
    const scheduledDeletionAt = await scheduleOwnAccountDeletion(parsed.data.password);

    return Response.json({ scheduledDeletionAt });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

export async function DELETE() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-account-deletion-cancel:${session.user.id}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    await cancelOwnAccountDeletion();

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
