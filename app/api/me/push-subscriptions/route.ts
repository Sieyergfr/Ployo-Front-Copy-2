import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { headers } from "next/headers";

/**
 * Registrierung eines Geräte-Tokens für Push. Die App meldet sich nach dem
 * Login selbst an (src/lib/push.ts) und beim Logout wieder ab. Versendet
 * wird über den Expo Push Service, s. lib/notifications/dispatch.ts.
 *
 * Tote Tokens räumt der Versand selbst weg ("DeviceNotRegistered"); Geräte,
 * die sich gar nicht mehr melden, fallen im Cleanup-Job raus.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-push-subscribe:${session.user.id}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    platform?: string;
    token?: string;
  } | null;

  if (!body?.token?.trim()) {
    return Response.json({ error: "'token' ist erforderlich." }, { status: 400 });
  }

  const token = body.token.trim();
  const platform = body.platform?.trim() || "ios";

  await prisma.pushSubscription.upsert({
    where: { userId_token: { userId: session.user.id, token } },
    create: { userId: session.user.id, token, platform },
    update: { platform },
  });

  return Response.json({ status: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const token = new URL(request.url).searchParams.get("token")?.trim();

  if (!token) {
    return Response.json({ error: "Parameter 'token' fehlt." }, { status: 400 });
  }

  await prisma.pushSubscription.deleteMany({
    where: { userId: session.user.id, token },
  });

  return Response.json({ status: true });
}
