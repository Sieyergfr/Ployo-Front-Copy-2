import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import FormSubmitButton from "@/components/FormSubmitButton";
import PageHeader from "@/components/PageHeader";
import { getAccountOverview } from "@/lib/account-service";
import { KeyRound, Save, ShieldAlert, UserCog } from "lucide-react";
import Link from "next/link";
import {
  changePasswordAction,
  deleteAccountAction,
  updateAccountNameAction,
} from "@/app/(dashboard)/konto/actions";

export const metadata = {
  title: "Konto",
};

const savedMessages: Record<string, string> = {
  name: "Anzeigename gespeichert.",
  password: "Passwort geändert.",
};

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof UserCog;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-white px-6 py-[22px]">
      <h2 className="mb-4 flex items-center gap-2 font-display text-[16px] font-semibold tracking-[-0.3px] text-ink">
        <Icon size={16} />
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string | string[] }>;
}) {
  const account = await getAccountOverview();
  const savedParam = (await searchParams).saved;
  const saved = Array.isArray(savedParam) ? savedParam[0] : savedParam;
  const savedMessage = saved ? savedMessages[saved] : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Persönliche Einstellungen"
        title="Konto"
        subtitle={account.email}
      />

      {savedMessage && (
        <p className="mb-4 rounded-[10px] border border-success/25 bg-success/10 px-3 py-2.5 text-[12.5px] text-success">
          {savedMessage}
        </p>
      )}

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
        <div className="flex flex-col gap-4">
          <Card title="Profil" icon={UserCog}>
            <form action={updateAccountNameAction} className="flex flex-col gap-3">
              <div className="field">
                <label htmlFor="account-name" className="label">
                  Anzeigename
                </label>
                <input
                  id="account-name"
                  name="name"
                  className="input"
                  defaultValue={account.name}
                  required
                  minLength={2}
                />
              </div>
              <div className="field">
                <label htmlFor="account-email" className="label">
                  E-Mail
                </label>
                <input
                  id="account-email"
                  className="input bg-bg"
                  defaultValue={account.email}
                  readOnly
                />
                <p className="mt-1 text-[11.5px] text-muted">
                  {account.emailVerified
                    ? "Bestätigt."
                    : "Noch nicht bestätigt."}{" "}
                  Eine Änderung der Anmelde-E-Mail ist derzeit nicht möglich.
                </p>
              </div>
              <div className="flex justify-end border-t border-border-soft pt-4">
                <FormSubmitButton Icon={Save} pendingLabel="Wird gespeichert...">
                  Speichern
                </FormSubmitButton>
              </div>
            </form>
          </Card>

          <Card title="Zugehörigkeiten" icon={UserCog}>
            {account.memberships.length === 0 ? (
              <p className="text-[12.5px] text-muted">
                Sie gehören derzeit keinem Unternehmen an.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {account.memberships.map((membership) => (
                  <Link
                    key={membership.tenant.slug}
                    href={`/u/${membership.tenant.slug}`}
                    className="flex items-center justify-between gap-3 rounded-[10px] border border-border-light bg-bg px-3 py-2.5 no-underline transition-colors hover:border-muted"
                  >
                    <span className="text-[13px] font-semibold text-ink">
                      {membership.tenant.name}
                    </span>
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
                      {membership.role}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11.5px] text-muted">
              Aktive Sitzungen: {account.sessionCount}
            </p>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Passwort ändern" icon={KeyRound}>
            <form action={changePasswordAction} className="flex flex-col gap-3">
              <div className="field">
                <label htmlFor="account-current-password" className="label">
                  Aktuelles Passwort
                </label>
                <input
                  id="account-current-password"
                  name="currentPassword"
                  type="password"
                  className="input"
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="account-new-password" className="label">
                  Neues Passwort
                </label>
                <input
                  id="account-new-password"
                  name="newPassword"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
                <p className="mt-1 text-[11.5px] text-muted">
                  Mindestens 12 Zeichen.
                </p>
              </div>
              <div className="field">
                <label htmlFor="account-new-password-repeat" className="label">
                  Neues Passwort wiederholen
                </label>
                <input
                  id="account-new-password-repeat"
                  name="newPasswordRepeat"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  name="revokeOtherSessions"
                  className="peer sr-only"
                  defaultChecked
                />
                <span className="checkbox" />
                <span className="checkbox-label">
                  Andere Sitzungen abmelden
                </span>
              </label>
              <div className="flex justify-end border-t border-border-soft pt-4">
                <FormSubmitButton Icon={KeyRound} pendingLabel="Wird geändert...">
                  Passwort ändern
                </FormSubmitButton>
              </div>
            </form>
          </Card>

          <Card title="Konto löschen" icon={ShieldAlert}>
            <p className="text-[12.5px] leading-5 text-muted">
              Das Konto wird endgültig gelöscht, inklusive aller Sitzungen und
              Mandanten-Zugehörigkeiten. Personalakten des Unternehmens bleiben
              bestehen. Sind Sie alleinige/r Inhaber/in eines Unternehmens,
              muss zuvor eine andere Person als Inhaber/in eingetragen werden.
            </p>
            <form
              id="delete-account-form"
              action={deleteAccountAction}
              className="mt-3 flex flex-col gap-3"
            >
              <div className="field">
                <label htmlFor="account-delete-password" className="label">
                  Passwort zur Bestätigung
                </label>
                <input
                  id="account-delete-password"
                  name="password"
                  type="password"
                  className="input"
                  autoComplete="current-password"
                  required
                />
              </div>
            </form>
            <div className="mt-3 flex justify-end border-t border-border-soft pt-4">
              <ConfirmSubmitButton
                form="delete-account-form"
                className="btn btn-secondary border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
                title="Konto endgültig löschen"
                confirmLabel="Konto löschen"
                description="Ihr Konto und alle Sitzungen werden endgültig gelöscht. Dieser Schritt kann nicht rückgängig gemacht werden."
              >
                Konto löschen
              </ConfirmSubmitButton>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
