import "server-only";
import { logger } from "@/lib/logger";

/**
 * Zentraler E-Mail-Versand. Nutzt SMTP, sobald SMTP_HOST konfiguriert ist.
 * Ohne SMTP-Konfiguration werden Mails nicht versendet, sondern nur im
 * Server-Log vermerkt (ohne Link/Token-Inhalte, um Secrets aus Logs zu halten).
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /**
   * Antwortadresse, falls sie vom Absender abweicht. Gebraucht beim
   * Kontaktformular: Absender bleibt SMTP_FROM (sonst scheitert SPF/DKIM),
   * antworten soll das Postfach aber an den Einsender.
   */
  replyTo?: string;
};

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export async function sendEmail(input: SendEmailInput) {
  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV === "production") {
      logger.error("SMTP ist nicht konfiguriert – E-Mail wurde nicht versendet.", {
        to: input.to,
        subject: input.subject,
      });
      throw new Error("EMAIL_NOT_CONFIGURED");
    }

    logger.info("E-Mail (dev, SMTP fehlt) — nur geloggt, nicht versendet.", {
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return;
  }

  const { createTransport } = await import("nodemailer");
  const transporter = createTransport({
    host: process.env.SMTP_HOST,
    port: Number.parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        }
      : undefined,
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo,
  });
}

function emailLayout(title: string, bodyHtml: string) {
  return `<!doctype html>
<html lang="de">
  <body style="margin:0;padding:24px;background:#f4f4f2;font-family:Arial,Helvetica,sans-serif;color:#1a1a18;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <p style="font-size:18px;font-weight:bold;margin:0 0 16px;">Ployo</p>
      <p style="font-size:16px;font-weight:bold;margin:0 0 12px;">${title}</p>
      ${bodyHtml}
      <p style="font-size:12px;color:#6e6e6b;margin:24px 0 0;">
        Wenn Sie diese E-Mail nicht erwartet haben, können Sie sie ignorieren.
      </p>
    </div>
  </body>
</html>`;
}

/** Minimal-Escaping fuer die HTML-Variante, wie lib/notifications/messages.ts. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function actionButton(url: string, label: string) {
  return `<p style="margin:20px 0;">
    <a href="${url}" style="display:inline-block;background:#2a6fdb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;">${label}</a>
  </p>
  <p style="font-size:12px;color:#6e6e6b;word-break:break-all;">Falls der Button nicht funktioniert: ${url}</p>`;
}

export async function sendPasswordResetEmail(input: { to: string; url: string }) {
  await sendEmail({
    to: input.to,
    subject: "Passwort zurücksetzen",
    text: `Sie haben angefordert, Ihr Ployo-Passwort zurückzusetzen.\n\nLink: ${input.url}\n\nDer Link ist zeitlich begrenzt gültig. Wenn Sie das nicht waren, ignorieren Sie diese E-Mail.`,
    html: emailLayout(
      "Passwort zurücksetzen",
      `<p style="font-size:14px;line-height:1.5;">Sie haben angefordert, Ihr Ployo-Passwort zurückzusetzen. Der Link ist zeitlich begrenzt gültig.</p>${actionButton(input.url, "Neues Passwort festlegen")}`,
    ),
  });
}

export async function sendAccountDeletionRequestEmail(input: { to: string; url: string }) {
  await sendEmail({
    to: input.to,
    subject: "Ployo-Konto loeschen",
    text: `Sie haben angefordert, Ihr Ployo-Konto zu loeschen.

Link (15 Minuten gueltig): ${input.url}

Ueber diesen Link werden Ihre Zugangsdaten, aktive Sitzungen, Social-Login-Verknuepfungen und Push-Benachrichtigungs-Token unwiderruflich geloescht. Personal- und Beschaeftigungsdaten, die Ihr Arbeitgeber gesetzlich aufbewahren muss, bleiben davon unberuehrt. Wenn Sie das nicht waren, ignorieren Sie diese E-Mail - es passiert nichts.`,
    html: emailLayout(
      "Ployo-Konto loeschen",
      `<p style="font-size:14px;line-height:1.5;">Sie haben angefordert, Ihr Ployo-Konto zu loeschen. Der Link ist 15 Minuten gueltig und loescht Ihre Zugangsdaten, Sitzungen, Social-Login-Verknuepfungen und Push-Token. Personaldaten, die Ihr Arbeitgeber gesetzlich aufbewahren muss, bleiben unberuehrt.</p>${actionButton(input.url, "Konto endgueltig loeschen")}`,
    ),
  });
}

export async function sendVerificationEmail(input: { to: string; url: string }) {
  await sendEmail({
    to: input.to,
    subject: "E-Mail-Adresse bestätigen",
    text: `Bitte bestätigen Sie Ihre E-Mail-Adresse für Ihr Ployo-Konto.\n\nLink: ${input.url}`,
    html: emailLayout(
      "E-Mail-Adresse bestätigen",
      `<p style="font-size:14px;line-height:1.5;">Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihr Ployo-Konto zu aktivieren.</p>${actionButton(input.url, "E-Mail bestätigen")}`,
    ),
  });
}

export async function sendChangeEmailConfirmationEmail(input: {
  to: string;
  newEmail: string;
  url: string;
}) {
  await sendEmail({
    to: input.to,
    subject: "Bestätigen Sie die Änderung Ihrer E-Mail-Adresse",
    text: `Für Ihr Ployo-Konto wurde eine Änderung der Anmelde-E-Mail zu ${input.newEmail} angefordert.\n\nBestätigen: ${input.url}\n\nWenn Sie das nicht waren, ignorieren Sie diese E-Mail — Ihre Adresse bleibt unverändert.`,
    html: emailLayout(
      "E-Mail-Änderung bestätigen",
      `<p style="font-size:14px;line-height:1.5;">Für Ihr Ployo-Konto wurde eine Änderung der Anmelde-E-Mail zu <strong>${escapeHtml(input.newEmail)}</strong> angefordert.</p>${actionButton(input.url, "Änderung bestätigen")}<p style="font-size:12px;color:#6e6e6b;">Wenn Sie das nicht waren, ignorieren Sie diese E-Mail — Ihre Adresse bleibt unverändert.</p>`,
    ),
  });
}

export async function sendInvitationEmail(input: {
  to: string;
  tenantName: string;
  url: string;
}) {
  await sendEmail({
    to: input.to,
    subject: `Einladung zu ${input.tenantName} bei Ployo`,
    text: `Sie wurden zu „${input.tenantName}“ bei Ployo eingeladen.\n\nEinladung annehmen: ${input.url}`,
    html: emailLayout(
      `Einladung zu ${escapeHtml(input.tenantName)}`,
      `<p style="font-size:14px;line-height:1.5;">Sie wurden eingeladen, dem Arbeitsbereich „${escapeHtml(input.tenantName)}“ bei Ployo beizutreten.</p>${actionButton(input.url, "Einladung annehmen")}`,
    ),
  });
}

/** Postfach fuer Kontaktanfragen aus App und Website (siehe Impressum). */
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL?.trim() || "info@ployo.io";

/**
 * Kontaktanfrage aus dem Formular der Mobile-App (POST /api/contact).
 *
 * Absender bleibt SMTP_FROM — eine fremde Adresse als `from` wuerde an
 * SPF/DKIM scheitern und die Mail im Spam landen. Die eingegebene Adresse
 * steht stattdessen im `replyTo`, sodass eine Antwort direkt beim Einsender
 * landet.
 */
export async function sendContactRequestEmail(input: {
  name: string;
  email: string;
  message: string;
  /** Woher die Anfrage kam, z. B. "App (Anmeldung)" — nur zur Einordnung. */
  source?: string;
}) {
  const source = input.source ?? "App";
  const lines = [
    `Name: ${input.name}`,
    `E-Mail: ${input.email}`,
    `Quelle: ${source}`,
    "",
    input.message,
  ].join("\n");

  await sendEmail({
    to: CONTACT_EMAIL,
    replyTo: input.email,
    subject: `Kontaktanfrage von ${input.name}`,
    text: lines,
    html: emailLayout(
      "Neue Kontaktanfrage",
      `<p style="font-size:14px;line-height:1.5;margin:0 0 12px;">
        <strong>Name:</strong> ${escapeHtml(input.name)}<br />
        <strong>E-Mail:</strong> ${escapeHtml(input.email)}<br />
        <strong>Quelle:</strong> ${escapeHtml(source)}
      </p>
      <p style="font-size:14px;line-height:1.6;white-space:pre-wrap;margin:0;">${escapeHtml(
        input.message,
      )}</p>`,
    ),
  });
}
