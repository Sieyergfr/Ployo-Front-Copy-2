import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { logger, runWithRequestId } from "@/lib/logger";

export const runtime = "nodejs";

const APPLE_ISSUER = "https://appleid.apple.com";

// Modulweit statt pro Request, damit jose den JWKS zwischen Aufrufen cached
// statt ihn bei jeder Notification neu von Apple zu laden.
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

interface AppleServerNotificationEvents {
  type: "email-disabled" | "email-enabled" | "consent-revoked" | "account-delete";
  sub: string;
  event_time: number;
  email?: string;
  is_private_email?: boolean;
}

/**
 * Apple "Sign in with Apple" Server-to-Server Notifications. Apple sendet
 * hier form-encoded ein signiertes JWT (`payload`), wenn sich der
 * Autorisierungsstatus auf Apple-Seite ändert — unabhängig vom eigentlichen
 * OAuth-Callback (`/api/auth/callback/apple`), der nur beim Login läuft.
 */
export async function POST(request: Request) {
  return runWithRequestId((requestId) => handleAppleNotification(request, requestId));
}

async function handleAppleNotification(request: Request, requestId: string) {
  const clientId = process.env.APPLE_CLIENT_ID;

  if (!clientId) {
    return Response.json({ error: "Apple Sign-In ist nicht konfiguriert." }, { status: 503 });
  }

  const form = await request.formData();
  const token = form.get("payload");

  if (typeof token !== "string" || !token) {
    return Response.json(
      { error: "Fehlendes payload." },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  let events: AppleServerNotificationEvents;

  try {
    const { payload } = await jwtVerify(token, appleJwks, {
      issuer: APPLE_ISSUER,
      audience: clientId,
    });

    events = JSON.parse(String(payload.events)) as AppleServerNotificationEvents;
  } catch (error) {
    logger.error("Apple-S2S-Notification: Verifizierung fehlgeschlagen.", {
      error: error instanceof Error ? error.message : String(error),
    });

    return Response.json(
      { error: "Ungültige Signatur." },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  logger.info("Apple-S2S-Notification empfangen.", { type: events.type, sub: events.sub });

  switch (events.type) {
    // Nutzer hat den Zugriff für Ployo in den Apple-ID-Einstellungen
    // widerrufen, oder die Apple-ID selbst wurde gelöscht: die verknüpfte
    // Anmeldung ist in beiden Fällen nicht mehr gültig. Wir entfernen nur
    // die Provider-Verknüpfung + aktive Sitzungen — das eigentliche
    // Ployo-Konto (ggf. weiterhin per Passwort/Google nutzbar) bleibt
    // bestehen; eine vollständige Löschung ist eine bewusste Nutzerin-
    // /Admin-Entscheidung (siehe scheduleOwnAccountDeletion in
    // lib/account-service.ts) und wird hier nicht automatisch ausgelöst.
    case "consent-revoked":
    case "account-delete": {
      await unlinkAppleAccount(events.sub, events.type);
      break;
    }

    case "email-disabled":
    case "email-enabled":
      // Private-Relay-Weiterleitung geändert. Wir speichern keine separate
      // Relay-Adresse, daher hier nur protokolliert (relevant, falls Mails
      // an eine deaktivierte Relay-Adresse zu bouncen beginnen).
      logger.warn("Apple-S2S-Notification: Private-Relay-Status geändert.", {
        type: events.type,
        sub: events.sub,
      });
      break;

    default:
      break;
  }

  return Response.json({ status: "ok" }, { headers: { "x-request-id": requestId } });
}

async function unlinkAppleAccount(
  sub: string,
  reason: "consent-revoked" | "account-delete",
) {
  const account = await prisma.account.findFirst({
    where: { providerId: "apple", accountId: sub },
    select: { id: true, userId: true },
  });

  if (!account) {
    return;
  }

  await prisma.$transaction([
    prisma.account.delete({ where: { id: account.id } }),
    prisma.session.deleteMany({ where: { userId: account.userId } }),
  ]);

  logger.info("Apple-S2S-Notification: Verknüpfung entfernt, Sitzungen widerrufen.", {
    userId: account.userId,
    reason,
  });
}
