import { auth } from "@/lib/auth";
import { dismissAppPopup } from "@/lib/app-popups";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { headers } from "next/headers";

/** Popup geschlossen — erscheint für diesen Nutzer nicht wieder. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ popupId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-app-popups-dismiss:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const { popupId } = await params;

  if (!(await dismissAppPopup(session.user.id, popupId))) {
    return Response.json({ error: "Popup nicht gefunden." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
