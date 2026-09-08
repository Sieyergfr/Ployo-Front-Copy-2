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
import { getTranslations } from "next-intl/server";
import {
  acceptInvitationAction,
  loginAndAcceptInvitationAction,
  registerAndAcceptInvitationAction,
} from "./actions";

export const metadata = {
  title: "Einladung",
};

type T = Awaited<ReturnType<typeof getTranslations>>;

function getErrorMessages(t: T): Record<string, string> {
  return {
    email_mismatch: t("errorEmailMismatch"),
    expired: t("errorExpired"),
    already_accepted: t("errorAlreadyAccepted"),
    not_found: t("errorNotFound"),
    invalid_password: t("errorInvalidPassword"),
    user_exists: t("errorUserExists"),
    password_mismatch: t("errorPasswordMismatch"),
    password_too_short: t("errorPasswordTooShort"),
    signup_failed: t("errorSignupFailed"),
    terms_required: t("errorTermsRequired"),
    signin_failed: t("errorSigninFailed"),
    unexpected_error: t("errorUnexpected"),
    rate_limited: t("errorRateLimited"),
  };
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ fehler?: string }>;
}) {
  const t = await getTranslations("InvitePage");
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

  const errorMessages = getErrorMessages(t);
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
                title={t("notFoundTitle")}
                subtitle={t("notFoundSubtitle")}
              />
              <Link href="/login" className="btn btn-secondary mt-4 justify-center">
                {t("goToLogin")}
              </Link>
            </>
          ) : invitation.status !== "PENDING" ? (
            <>
              <CardHeader
                title={t("alreadyUsedTitle")}
                subtitle={t("alreadyUsedSubtitle", { tenant: invitation.tenantName })}
              />
              <Link href="/select" className="btn btn-secondary mt-4 justify-center">
                {t("goToCompanySelection")}
              </Link>
            </>
          ) : invitation.expired ? (
            <>
              <CardHeader
                title={t("expiredTitle")}
                subtitle={t("expiredSubtitle", { tenant: invitation.tenantName })}
              />
            </>
          ) : !session?.user ? (
            accountExists ? (
              <>
                <CardHeader
                  title={t("inviteToTenant", { tenant: invitation.tenantName })}
                  subtitle={t("accountExistsSubtitle")}
                />
                {errorBox}
                <form
                  action={loginAndAcceptInvitationAction}
                  className="mt-4 flex flex-col gap-3"
                >
                  <input type="hidden" name="token" value={token} />
                  <TextInput
                    id="invite-email"
                    label={t("emailLabel")}
                    type="email"
                    defaultValue={invitation.email}
                    disabled
                  />
                  <PasswordInput
                    id="password"
                    label={t("passwordLabel")}
                    placeholder="password"
                    autoComplete="current-password"
                    required
                  />
                  <PrimaryButton type="submit">
                    {t("loginAndAccept")}
                  </PrimaryButton>
                </form>
                <Link
                  href="/forgot-password"
                  className="mt-3 block text-center text-[12.5px] font-medium text-muted underline underline-offset-2"
                >
                  {t("forgotPassword")}
                </Link>
              </>
            ) : (
              <>
                <CardHeader
                  title={t("inviteToTenant", { tenant: invitation.tenantName })}
                  subtitle={t("createAccountSubtitle")}
                />
                {errorBox}
                <form
                  action={registerAndAcceptInvitationAction}
                  className="mt-4 flex flex-col gap-3"
                >
                  <input type="hidden" name="token" value={token} />
                  <TextInput
                    id="invite-email"
                    label={t("emailLabel")}
                    type="email"
                    defaultValue={invitation.email}
                    disabled
                  />
                  <div className="card-form-grid">
                    <TextInput
                      id="firstName"
                      type="text"
                      label={t("firstName")}
                      placeholder={t("firstNamePlaceholder")}
                      autoComplete="given-name"
                      required
                    />
                    <TextInput
                      id="lastName"
                      type="text"
                      label={t("lastName")}
                      placeholder={t("lastNamePlaceholder")}
                      autoComplete="family-name"
                      required
                    />
                  </div>
                  <PasswordInput
                    showStrength
                    id="password"
                    label={t("passwordLabel")}
                    placeholder="password"
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />
                  <PasswordInput
                    id="password_repeat"
                    label={t("repeatPassword")}
                    placeholder="password"
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />
                  <Checkbox id="terms" alignItems="start">
                    {t.rich("termsAgreement", {
                      terms: (chunks) => (
                        <Link href="/agb" className="text-ink underline underline-offset-2">
                          {chunks}
                        </Link>
                      ),
                      privacy: (chunks) => (
                        <Link href="/datenschutz" className="text-ink underline underline-offset-2">
                          {chunks}
                        </Link>
                      ),
                    })}
                  </Checkbox>
                  <PrimaryButton type="submit">
                    {t("createAccountAndJoin")}
                  </PrimaryButton>
                </form>
              </>
            )
          ) : (
            <>
              <CardHeader
                title={t("inviteToTenant", { tenant: invitation.tenantName })}
                subtitle={t("loggedInAs", { email: session.user.email })}
              />
              {errorBox}
              <form action={acceptInvitationAction} className="mt-4 flex flex-col gap-2">
                <input type="hidden" name="token" value={token} />
                <PrimaryButton type="submit">{t("acceptInvite")}</PrimaryButton>
              </form>
              <form action="/logout" method="post" className="mt-2">
                <button
                  type="submit"
                  className="w-full text-center text-[12.5px] font-medium text-muted underline underline-offset-2"
                >
                  {t("signInDifferentAccount")}
                </button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
