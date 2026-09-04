import { headers } from "next/headers";
import { isEmailConfigured, sendContactRequestEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * Kontaktformular aus der Mobile-App (Fragezeichen auf dem Anmeldebildschirm,
 * "Kontakt" im Profil). Bewusst ohne Sitzungsprüfung: der Screen ist auch vor
 * der Anmeldung erreichbar — genau dann, wenn jemand nicht hineinkommt und
 * Hilfe braucht (App-Store-Anforderung: erreichbarer Support).
 *
 * Weil die Route offen steht, hängen zwei Limits über der gemeinsamen
 * AppRateLimit-Tabelle davor (Absender-IP und angegebene Adresse), und der
 * eingegebene Text geht nur als `replyTo` hinaus, nie als Absender (siehe
 * lib/email.ts).
 */

export const runtime = "nodejs";

const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 200;
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_SOURCE_LENGTH = 60;

// Gleiches Muster wie in lib/auth.ts — absichtlich großzügig, die Adresse
// bestätigt sich ohnehin erst dadurch, dass eine Antwort ankommt.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Absenderkennung für das Limit.
 *
 * `x-real-ip` zuerst, weil nginx den Header aus `$remote_addr` setzt und ein
 * Client ihn damit nicht selbst bestimmen kann. `x-forwarded-for` entsteht
 * dagegen aus `$proxy_add_x_forwarded_for`: der Client darf den Anfang des
 * Headers vorgeben, nginx hängt die echte Adresse nur hinten an — deshalb der
 * **letzte** Eintrag und nicht der erste. Fehlen beide, bleibt ein
 * gemeinsamer Eimer übrig; das Limit greift dann global.
 */
async function clientKey() {
  const headerList = await headers();
  const realIp = headerList.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = headerList.get("x-forwarded-for")?.split(",");
  const lastHop = forwarded?.[forwarded.length - 1]?.trim();

  return lastHop || "unknown";
}

export async function POST(request: Request) {
  const ipLimit = await checkRateLimit({
    key: `contact-ip:${await clientKey()}`,
    limit: 10,
    windowSeconds: 3600,
  });

  if (!ipLimit.allowed) {
    return tooManyRequests(ipLimit);
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    email?: unknown;
    message?: unknown;
    source?: unknown;
  } | null;

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const source = typeof body?.source === "string" ? body.source.trim() : "";

  if (!name || name.length > MAX_NAME_LENGTH) {
    return Response.json({ error: "Bitte einen Namen angeben." }, { status: 400 });
  }

  if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) {
    return Response.json(
      { error: "Bitte eine gültige E-Mail-Adresse angeben." },
      { status: 400 },
    );
  }

  if (message.length < MIN_MESSAGE_LENGTH) {
    return Response.json(
      { error: "Bitte die Nachricht etwas ausführlicher formulieren." },
      { status: 400 },
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return Response.json(
      { error: "Die Nachricht ist zu lang (maximal 5000 Zeichen)." },
      { status: 400 },
    );
  }

  // Zweites Limit auf die angegebene Adresse: greift auch dann, wenn die
  // IP-Kennung fehlt oder wechselt (Mobilfunk, geteiltes NAT).
  const emailLimit = await checkRateLimit({
    key: `contact-email:${email}`,
    limit: 5,
    windowSeconds: 3600,
  });

  if (!emailLimit.allowed) {
    return tooManyRequests(emailLimit);
  }

  // Ohne SMTP würde sendEmail in Produktion werfen — vorher abfangen, damit
  // der Absender einen verständlichen Hinweis statt eines 500ers bekommt.
  if (!isEmailConfigured() && process.env.NODE_ENV === "production") {
    logger.error("Kontaktanfrage konnte nicht versendet werden: SMTP fehlt.");

    return Response.json(
      { error: "Der Nachrichtenversand ist derzeit nicht möglich." },
      { status: 503 },
    );
  }

  try {
    await sendContactRequestEmail({
      name,
      email,
      message,
      source: source.slice(0, MAX_SOURCE_LENGTH) || undefined,
    });
  } catch (error) {
    logger.error("Kontaktanfrage konnte nicht versendet werden.", {
      error: error instanceof Error ? error.message : String(error),
    });

    return Response.json(
      { error: "Die Nachricht konnte nicht zugestellt werden. Bitte später erneut versuchen." },
      { status: 502 },
    );
  }

  return Response.json({ status: true }, { status: 201 });
}
