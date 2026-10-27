import "@/app/(auth)/auth.css";
import AuthShell from "@/components/auth/AuthShell";
import { avatarColor } from "@/components/dashboard/ui";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { auth } from "@/lib/auth";
import { getOwnPreferences, getOwnScheduledDeletion, startPagePath } from "@/lib/account-service";
import { getTenantSelectOverview, type TenantSelectEntry } from "@/lib/tenant-select";
import { ArrowRight, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Unternehmen auswählen",
};

type T = Awaited<ReturnType<typeof getTranslations>>;

const openClass =
  "inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-[rgba(167,142,232,0.45)] bg-ink px-3.5 text-[14px] font-semibold text-white no-underline";
const ghostClass = "inline-flex min-h-10 items-center rounded-[10px] px-2.5 text-[14px] font-medium text-[#6e6e6b] no-underline hover:text-ink";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function StatusDot({ tone, children }: { tone: "success" | "trial" | "danger"; children: React.ReactNode }) {
  const color = { success: "text-[#2f7a4a] bg-[#2f7a4a]", trial: "text-[#6b4fc4] bg-[#8b6ed4]", danger: "text-[#b4332a] bg-[#b4332a]" }[tone];

  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${color.split(" ")[0]}`}>
      <span className={`size-1.5 rounded-full ${color.split(" ")[1]}`} />
      {children}
    </span>
  );
}

function TenantRow({ tenant, href, t, tRole }: { tenant: TenantSelectEntry; href: string; t: T; tRole: T }) {
  const roleLabel =
    tenant.roleName ??
    tRole({ OWNER: "roleOwner", ADMIN: "roleAdmin", HR: "roleHR", EMPLOYEE: "roleEmployee" }[tenant.role]);
  const billing = tenant.billing;

  return (
    <li className="flex flex-wrap items-center gap-3.5 border-b border-[#f0efeb] px-4 py-3.5 last:border-b-0">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-semibold text-white"
        style={{ background: avatarColor(tenant.name) }}
      >
        {getInitials(tenant.name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold">{tenant.name}</span>
        <span className="text-[13px] text-[#6e6e6b]">
          {roleLabel} · {t("employeeCount", { count: tenant.employeeCount })}
        </span>
      </span>
      <span className="flex flex-wrap items-center justify-end gap-2.5">
        {billing.state === "active" && <StatusDot tone="success">{t(`plan.${tenant.plan}`)}</StatusDot>}
        {billing.state === "trial" && <StatusDot tone="trial">{t("trialDaysLeft", { count: billing.daysLeft })}</StatusDot>}
        {billing.state === "blocked" && <StatusDot tone="danger">{t("blocked")}</StatusDot>}
        {billing.state === "trial" && tenant.canManageBilling && (
          <Link href={`/u/${tenant.slug}/einstellungen?kat=billing`} className={ghostClass}>
            {t("subscribe")}
          </Link>
        )}
        {billing.state === "blocked" ? (
          tenant.canManageBilling ? (
            <Link href={`/u/${tenant.slug}/abo-erforderlich`} className={openClass}>
              {t("subscribe")}
            </Link>
          ) : (
            <span className="text-[13px] text-[#6e6e6b]">{t("waitingForOwner")}</span>
          )
        ) : (
          <Link href={href} className={openClass}>
            {t("open")}
            <ArrowRight size={14} />
          </Link>
        )}
      </span>
    </li>
  );
}

export default async function TenantSelectPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (await getOwnScheduledDeletion()) {
    redirect("/konto-loeschung");
  }

  const [overview, preference, t, tRole, tFooter] = await Promise.all([
    getTenantSelectOverview({ id: session.user.id, email: session.user.email }),
    getOwnPreferences(),
    getTranslations("Auth.select"),
    getTranslations("DashboardLayout"),
    getTranslations("Auth.footer"),
  ]);
  const attention = overview.tenants.filter((tenant) => tenant.billing.state === "blocked" || tenant.billing.state === "trial").length;
  const userName = session.user.name || session.user.email;

  return (
    <AuthShell>
      <header className="relative z-[2] mx-auto box-border flex w-full max-w-[1100px] items-center justify-between gap-4 px-[clamp(16px,4vw,60px)] pt-6">
        <Link href="/" className="au-focus flex items-center gap-2 rounded-[9px] text-ink no-underline">
          <Image src="/logo_square_brand.svg" alt="" width={22} height={22} priority />
          <span className="font-display text-[18px] leading-none font-semibold tracking-[-0.4px]">Ployo</span>
        </Link>
        <span className="flex items-center gap-3">
          <span className="hidden items-center gap-2 text-[14px] sm:flex">
            <span
              className="flex size-8 items-center justify-center rounded-full text-[12px] font-semibold text-white"
              style={{ background: avatarColor(userName) }}
            >
              {getInitials(userName)}
            </span>
            {userName}
          </span>
          <form action="/logout" method="post">
            <button type="submit" className="au-focus cursor-pointer rounded-[9px] border-0 bg-transparent px-2 py-2 text-[14px] font-medium text-[#6e6e6b] hover:text-ink">
              {t("logout")}
            </button>
          </form>
        </span>
      </header>

      <main className="relative z-[1] mx-auto box-border flex w-full max-w-[728px] flex-1 flex-col gap-4 px-4 pt-[clamp(28px,6vh,56px)] pb-10">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 font-display text-[clamp(28px,4vw,34px)] font-semibold tracking-[-1px]">{t("title")}</h1>
          <span className="text-[14.5px] text-[#6e6e6b]">{t("signedInAs", { email: session.user.email })}</span>
        </div>

        {overview.invitations.map((invitation) => (
          <div
            key={invitation.token}
            className="flex flex-wrap items-center gap-3.5 rounded-[14px] border border-[rgba(139,111,224,0.25)] bg-[rgba(139,111,224,0.07)] px-3.5 py-3"
          >
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-semibold text-white"
              style={{ background: avatarColor(invitation.tenantName) }}
            >
              {getInitials(invitation.tenantName)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14.5px] font-semibold">{t("invitationTo", { company: invitation.tenantName })}</span>
              <span className="text-[13px] text-[#6e6e6b]">
                {invitation.invitedByName ? t("invitedBy", { name: invitation.invitedByName }) : t("invitationPending")}
              </span>
            </span>
            <Link
              href={`/invite/${invitation.token}`}
              className="inline-flex min-h-10 items-center rounded-[10px] border border-[#ecebe7] bg-white px-3.5 text-[14px] font-semibold text-ink no-underline"
            >
              {t("acceptInvitation")}
            </Link>
          </div>
        ))}

        <section className="au-card overflow-hidden rounded-[16px] p-1.5">
          <ul className="m-0 list-none p-0">
            {overview.tenants.map((tenant) => (
              <TenantRow key={tenant.id} tenant={tenant} href={startPagePath(tenant.slug, preference.startPage)} t={t} tRole={tRole} />
            ))}
          </ul>
          <Link
            href="/select/create"
            className={`flex items-center gap-3.5 rounded-[12px] border border-dashed border-[#dedad4] px-4 py-3.5 text-ink no-underline hover:border-[#9a9a96] ${
              overview.tenants.length ? "mt-1.5" : ""
            }`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#f2f1ed]">
              <Plus size={17} />
            </span>
            <span className="flex flex-col">
              <span className="text-[14.5px] font-semibold">{t("createNew")}</span>
              <span className="text-[13px] text-[#6e6e6b]">{t("createHint")}</span>
            </span>
          </Link>
        </section>

        <p className="m-0 text-center text-[13px] text-[#9a9a96]">
          {overview.tenants.length === 0
            ? t("empty")
            : attention > 0
              ? t("summaryAttention", { count: overview.tenants.length, attention })
              : t("summary", { count: overview.tenants.length })}
        </p>
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
        <span aria-hidden="true">·</span>
        <LocaleSwitcher className="inline-flex items-center gap-1.5 align-middle" />
      </footer>
    </AuthShell>
  );
}
