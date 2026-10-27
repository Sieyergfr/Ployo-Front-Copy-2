import "@/app/(auth)/auth.css";
import { declineInvitationAction } from "@/app/actions/self-service-requests";
import AuthShell from "@/components/auth/AuthShell";
import SelfServiceRequestButton from "@/components/SelfServiceRequestButton";
import { avatarColor } from "@/components/dashboard/ui";
import Image from "next/image";
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
import { getLocale, getTranslations } from "next-intl/server";
import {
  acceptInvitationAction,
  loginAndAcceptInvitationAction,
  registerAndAcceptInvitationAction,
} from "./actions";

export const metadata = {
  title: "Einladung",
};

type T = Awaited<ReturnType<typeof getTranslations>>;

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Kopf der offenen Einladung: Firmen-/Einladenden-Avatar, Titel, Rolle und Gültigkeit. */
function InviteHero({
  invitation,
  subtitle,
  t,
  tRole,
  locale,
}: {
  invitation: NonNullable<Awaited<ReturnType<typeof getInvitationByToken>>>;
  subtitle?: string;
  t: T;
  tRole: T;
  locale: string;
}) {
  const roleKey = ({ ADMIN: "roleAdmin", HR: "roleHR", EMPLOYEE: "roleEmployee" } as Record<string, string>)[invitation.role] ?? "roleEmployee";

  return (
    <div className="mb-5 flex flex-col items-center gap-2 text-center">
      <span className="relative mb-1">
        <span
          className="flex size-[50px] items-center justify-center rounded-[13px] text-[16px] font-semibold text-white"
          style={{ background: avatarColor(invitation.tenantName) }}
        >
          {initialsOf(invitation.tenantName)}
        </span>
        {invitation.invitedByName && (
          <span
            className="absolute -right-3 -bottom-2 flex size-[34px] items-center justify-center rounded-full border-[3px] border-white text-[11px] font-semibold text-white"
            style={{ background: avatarColor(invitation.invitedByName) }}
          >
            {initialsOf(invitation.invitedByName)}
          </span>
        )}
      </span>
      <span className="font-mono text-[10.5px] tracking-[0.12em] text-[#6e6e6b] uppercase">{t("eyebrow")}</span>
      <h1 className="m-0 font-display text-[clamp(21px,3vw,25px)] leading-[1.2] font-semibold tracking-[-0.5px]">
        {invitation.invitedByName
          ? t("invitedByTitle", { name: invitation.invitedByName, tenant: invitation.tenantName })
          : t("inviteToTenant", { tenant: invitation.tenantName })}
      </h1>
      <span className="flex flex-wrap justify-center gap-1.5">
        <span className="rounded-[7px] bg-[rgba(139,111,224,0.12)] px-2 py-[3px] text-[12.5px] font-semibold text-[#6b4fc4]">
          {t("roleChip", { role: tRole(roleKey) })}
        </span>
        {invitation.expiresAt && (
          <span className="rounded-[7px] bg-[#f2f1ed] px-2 py-[3px] text-[12.5px] text-[#6e6e6b]">
            {t("validUntil", { date: new Date(invitation.expiresAt).toLocaleDateString(locale === "en" ? "en-GB" : "de-DE") })}
          </span>
        )}
      </span>
      {subtitle && <p className="m-0 mt-1 text-[14px] leading-[1.5] text-[#6e6e6b]">{subtitle}</p>}
    </div>
  );
}

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
  const tRole = await getTranslations("DashboardLayout");
  const tFooter = await getTranslations("Auth.footer");
  const locale = await getLocale();
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
    <AuthShell>
      <header className="relative z-[2] mx-auto box-border flex w-full max-w-[1200px] items-center justify-between gap-4 px-[clamp(16px,4vw,60px)] pt-6">
        <Link href="/" className="au-focus flex items-center gap-2 rounded-[9px] text-ink no-underline">
          <Image src="/logo_square_brand.svg" alt="" width={22} height={22} priority />
          <span className="font-display text-[18px] leading-none font-semibold tracking-[-0.4px]">Ployo</span>
        </Link>
        {!session?.user && (
          <Link href="/login" className="au-link au-focus rounded-[10px] px-3 py-2.5 text-[14px] font-medium text-muted-2 no-underline">
            {t("signIn")}
          </Link>
        )}
      </header>
      <main className="relative z-[1] box-border flex flex-1 items-center justify-center px-4 pt-10 pb-8">
        <div className="au-card box-border w-full max-w-[460px] rounded-card p-[clamp(24px,5vw,36px)]">
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
                <InviteHero invitation={invitation} subtitle={t("accountExistsSubtitle")} t={t} tRole={tRole} locale={locale} />
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
                <InviteHero invitation={invitation} subtitle={t("createAccountSubtitle")} t={t} tRole={tRole} locale={locale} />
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
              <InviteHero invitation={invitation} subtitle={t("loggedInAs", { email: session.user.email })} t={t} tRole={tRole} locale={locale} />
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
          {isPendingInvitation && (
            <div className="mt-4 flex items-center justify-center gap-1 text-[13px] text-[#6e6e6b]">
              {t("notYou")}
              <SelfServiceRequestButton
                action={declineInvitationAction}
                fields={{ token }}
                className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-ink underline-offset-2 hover:underline disabled:cursor-default disabled:text-[#6e6e6b] disabled:no-underline"
                doneLabel={t("declined")}
                successTitle={t("declinedToast")}
              >
                {t("declineInvitation")}
              </SelfServiceRequestButton>
            </div>
          )}
        </div>
      </main>
      <footer className="relative z-[1] flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 pb-6 text-[12.5px] text-muted-2">
        <span>© {new Date().getFullYear()} Ployo</span>
        <span aria-hidden="true">·</span>
        <Link href="/impressum" className="au-text-link au-focus rounded text-muted-2 no-underline">
          {tFooter("imprint")}
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/datenschutz" className="au-text-link au-focus rounded text-muted-2 no-underline">
          {tFooter("privacy")}
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/agb" className="au-text-link au-focus rounded text-muted-2 no-underline">
          {tFooter("terms")}
        </Link>
      </footer>
    </AuthShell>
  );
}
