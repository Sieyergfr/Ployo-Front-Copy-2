import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Datenauskunft/-export für das eigene Konto (Art. 15 / Art. 20 DSGVO).
 * Liefert die zum angemeldeten Nutzer gespeicherten Konto- und
 * Mitgliedschaftsdaten als JSON-Download.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  // Der Export ist teuer; wenige Aufrufe pro Stunde genügen.
  const limit = checkRateLimit({
    key: `me-export:${session.user.id}`,
    limit: 5,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const [user, memberships, sessions, linkedEmployees] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.tenantMembership.findMany({
      where: { userId: session.user.id },
      select: {
        role: true,
        createdAt: true,
        tenant: { select: { name: true, slug: true } },
      },
    }),
    prisma.session.findMany({
      where: { userId: session.user.id },
      select: {
        createdAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
      },
    }),
    prisma.tenantEmployee.findMany({
      where: { userId: session.user.id },
      select: {
        name: true,
        employeeNumber: true,
        email: true,
        tenant: { select: { name: true, slug: true } },
      },
    }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    account: user,
    memberships,
    sessions,
    linkedEmployeeRecords: linkedEmployees,
    hinweis:
      "Personalakten-Daten (z. B. Verträge, Abwesenheiten) verwaltet der jeweilige Arbeitgeber als Verantwortlicher. Wenden Sie sich für deren Auskunft an Ihr Unternehmen.",
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="ployo-datenexport.json"',
    },
  });
}
