import { z } from "zod";
import { auth } from "@/lib/auth";
import { changeAccountPassword } from "@/lib/account-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { invalidRequestResponse } from "@/lib/api/validation";
import { headers } from "next/headers";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
  revokeOtherSessions: z.boolean().optional(),
});

/** Passwort ändern. Bewusst vage Fehlermeldung bei falschem `currentPassword` (kein Account-Enumeration-Leak). */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-account-password:${session.user.id}`,
    limit: 10,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);

  if (!parsed.success) {
    return invalidRequestResponse(parsed.error);
  }

  try {
    await changeAccountPassword({
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      revokeOtherSessions: Boolean(parsed.data.revokeOtherSessions),
    });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
