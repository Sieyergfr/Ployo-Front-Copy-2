import { z } from "zod";
import { isEmailConfigured, sendContactRequestEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { invalidRequestResponse } from "@/lib/api/validation";

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

const contactSchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen angeben.").max(MAX_NAME_LENGTH),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(MAX_EMAIL_LENGTH)
    .regex(EMAIL_PATTERN, "Bitte eine gültige E-Mail-Adresse angeben."),
  message: z
    .string()
    .trim()
    .min(MIN_MESSAGE_LENGTH, "Bitte die Nachricht etwas ausführlicher formulieren.")
    .max(MAX_MESSAGE_LENGTH, "Die Nachricht ist zu lang (maximal 5000 Zeichen)."),
  source: z.string().trim().max(MAX_SOURCE_LENGTH).optional().default(""),
});

export async function POST(request: Request) {
  const ipLimit = await checkRateLimit({
    key: `contact-ip:${await getClientIp(request.headers)}`,
    limit: 10,
    windowSeconds: 3600,
  });

  if (!ipLimit.allowed) {
    return tooManyRequests(ipLimit);
  }

  const body = await request.json().catch(() => null);
  const parsed = contactSchema.safeParse(body);

  if (!parsed.success) {
    return invalidRequestResponse(parsed.error);
  }

  const { name, email, message, source } = parsed.data;

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
