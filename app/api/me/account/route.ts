import { z } from "zod";
import { auth } from "@/lib/auth";
import { getAccountOverview, updateAccountName } from "@/lib/account-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { invalidRequestResponse } from "@/lib/api/validation";
import { headers } from "next/headers";

const updateAccountSchema = z.object({
  name: z.string().trim().min(1),
});

/** Konto-Übersicht: Name/E-Mail/2FA-Status + Mitgliedschaften über ALLE Mandanten hinweg + aktive Sitzungen. */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-account:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const overview = await getAccountOverview();

    return Response.json(overview);
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Anzeigenamen ändern. */
export async function PATCH(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-account-update:${session.user.id}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = await request.json().catch(() => null);
  const parsed = updateAccountSchema.safeParse(body);

  if (!parsed.success) {
    return invalidRequestResponse(parsed.error);
  }

  try {
    await updateAccountName(parsed.data.name);

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
