import "server-only";

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
};

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export async function sendEmail(input: SendEmailInput) {
  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        `[email] SMTP ist nicht konfiguriert – E-Mail an ${input.to} („${input.subject}“) wurde NICHT versendet.`,
      );
      throw new Error("EMAIL_NOT_CONFIGURED");
    }

    console.info(
      `[email] (dev, SMTP fehlt) E-Mail an ${input.to}: ${input.subject}\n${input.text}`,
    );
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
      `Einladung zu ${input.tenantName}`,
      `<p style="font-size:14px;line-height:1.5;">Sie wurden eingeladen, dem Arbeitsbereich „${input.tenantName}“ bei Ployo beizutreten.</p>${actionButton(input.url, "Einladung annehmen")}`,
    ),
  });
}
