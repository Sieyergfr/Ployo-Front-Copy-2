import AuthHeader from "@/components/AuthHeader";
import Card from "@/components/Card/card";
import CardHeader from "@/components/Card/CardHeader";
import PrimaryButton from "@/components/Buttons/PrimaryButton";
import Checkbox from "@/components/inputs/checkbox";
import PasswordInput from "@/components/inputs/password-input";
import TextInput from "@/components/inputs/text-input";
import { auth } from "@/lib/auth";
import {
  getInvitationByToken,
  hasAccountForEmail,
} from "@/lib/invitation-service";
import { headers } from "next/headers";
import Link from "next/link";
import {
  acceptInvitationAction,
  loginAndAcceptInvitationAction,
  registerAndAcceptInvitationAction,
} from "./actions";

export const metadata = {
  title: "Einladung",
};

const errorMessages: Record<string, string> = {
  email_mismatch:
    "Diese Einladung wurde für eine andere E-Mail-Adresse ausgestellt. Bitte melden Sie sich mit dem passenden Konto an.",
  expired: "Diese Einladung ist abgelaufen. Bitte fordern Sie eine neue an.",
  already_accepted: "Diese Einladung wurde bereits angenommen.",
  not_found: "Diese Einladung existiert nicht mehr.",
  invalid_password: "Das Passwort ist nicht korrekt. Bitte erneut versuchen.",
  user_exists:
    "Für diese E-Mail-Adresse existiert bereits ein Konto. Bitte geben Sie Ihr Passwort ein.",
  password_mismatch: "Die Passwörter stimmen nicht überein.",
  password_too_short: "Das Passwort muss mindestens 12 Zeichen lang sein.",
  signup_failed:
    "Das Konto konnte nicht erstellt werden. Bitte versuchen Sie es erneut.",
  terms_required: "Bitte akzeptieren Sie die Nutzungsbedingungen.",
  signin_failed:
    "Das Konto wurde erstellt, die Anmeldung schlug jedoch fehl. Bitte melden Sie sich über die Anmeldeseite an.",
};

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ fehler?: string }>;
}) {
  const { token } = await params;
  const { fehler } = await searchParams;
  const invitation = await getInvitationByToken(token);
  const session = await auth.api.getSession({ headers: await headers() });
  const isPendingInvitation = Boolean(
    invitation && invitation.status === "PENDING" && !invitation.expired,
  );
  const accountExists =
    invitation && isPendingInvitation && !session?.user
      ? await hasAccountForEmail(invitation.email)
      : false;

  const errorBox =
    fehler && errorMessages[fehler] ? (
      <p className="mt-3 rounded-[10px] border border-danger/20 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
        {errorMessages[fehler]}
      </p>
    ) : null;

  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <div className="w-full max-w-[420px]">
        <AuthHeader />
        <Card>
          {!invitation ? (
            <>
              <CardHeader
                title="Einladung nicht gefunden"
                subtitle="Der Einladungslink ist ungültig oder wurde zurückgezogen."
              />
              <Link href="/login" className="btn btn-secondary mt-4 justify-center">
                Zur Anmeldung
              </Link>
            </>
          ) : invitation.status !== "PENDING" ? (
            <>
              <CardHeader
                title="Einladung bereits verwendet"
                subtitle={`Die Einladung zu „${invitation.tenantName}“ wurde bereits angenommen.`}
              />
              <Link href="/select" className="btn btn-secondary mt-4 justify-center">
                Zur Unternehmensauswahl
              </Link>
            </>
          ) : invitation.expired ? (
            <>
              <CardHeader
                title="Einladung abgelaufen"
                subtitle={`Die Einladung zu „${invitation.tenantName}“ ist abgelaufen. Bitte lassen Sie sich neu einladen.`}
              />
            </>
          ) : !session?.user ? (
            accountExists ? (
              <>
                <CardHeader
                  title={`Einladung zu ${invitation.tenantName}`}
                  subtitle="Für diese E-Mail-Adresse existiert bereits ein Konto. Geben Sie Ihr Passwort ein, um die Einladung anzunehmen."
                />
                {errorBox}
                <form
                  action={loginAndAcceptInvitationAction}
                  className="mt-4 flex flex-col gap-3"
                >
                  <input type="hidden" name="token" value={token} />
                  <TextInput
                    id="invite-email"
                    label="E-Mail"
                    type="email"
                    defaultValue={invitation.email}
                    disabled
                  />
                  <PasswordInput
                    id="password"
                    label="Passwort"
                    placeholder="password"
                    autoComplete="current-password"
                    required
                  />
                  <PrimaryButton type="submit">
                    Anmelden & Einladung annehmen
                  </PrimaryButton>
                </form>
                <Link
                  href="/forgot-password"
                  className="mt-3 block text-center text-[12.5px] font-medium text-muted underline underline-offset-2"
                >
                  Passwort vergessen?
                </Link>
              </>
            ) : (
              <>
                <CardHeader
                  title={`Einladung zu ${invitation.tenantName}`}
                  subtitle="Erstellen Sie ein Konto, um die Einladung anzunehmen. Die E-Mail-Adresse ist durch die Einladung bereits bestätigt."
                />
                {errorBox}
                <form
                  action={registerAndAcceptInvitationAction}
                  className="mt-4 flex flex-col gap-3"
                >
                  <input type="hidden" name="token" value={token} />
                  <TextInput
                    id="invite-email"
                    label="E-Mail"
                    type="email"
                    defaultValue={invitation.email}
                    disabled
                  />
                  <div className="card-form-grid">
                    <TextInput
                      id="firstName"
                      type="text"
                      label="Vorname"
                      placeholder="Anna"
                      autoComplete="given-name"
                      required
                    />
                    <TextInput
                      id="lastName"
                      type="text"
                      label="Nachname"
                      placeholder="Müller"
                      autoComplete="family-name"
                      required
                    />
                  </div>
                  <PasswordInput
                    showStrength
                    id="password"
                    label="Passwort"
                    placeholder="password"
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />
                  <PasswordInput
                    id="password_repeat"
                    label="Passwort wiederholen"
                    placeholder="password"
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />
                  <Checkbox id="terms" alignItems="start">
                    Ich stimme den{" "}
                    <Link href="/agb" className="text-ink underline underline-offset-2">
                      Nutzungsbedingungen
                    </Link>{" "}
                    und der{" "}
                    <Link href="/datenschutz" className="text-ink underline underline-offset-2">
                      Datenschutzerklärung
                    </Link>{" "}
                    zu.
                  </Checkbox>
                  <PrimaryButton type="submit">
                    Konto erstellen & beitreten
                  </PrimaryButton>
                </form>
              </>
            )
          ) : (
            <>
              <CardHeader
                title={`Einladung zu ${invitation.tenantName}`}
                subtitle={`Angemeldet als ${session.user.email}. Mit dem Beitritt erhalten Sie Zugriff auf den Arbeitsbereich.`}
              />
              {errorBox}
              <form action={acceptInvitationAction} className="mt-4 flex flex-col gap-2">
                <input type="hidden" name="token" value={token} />
                <PrimaryButton type="submit">Einladung annehmen</PrimaryButton>
              </form>
              <form action="/logout" method="post" className="mt-2">
                <button
                  type="submit"
                  className="w-full text-center text-[12.5px] font-medium text-muted underline underline-offset-2"
                >
                  Mit anderem Konto anmelden
                </button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
