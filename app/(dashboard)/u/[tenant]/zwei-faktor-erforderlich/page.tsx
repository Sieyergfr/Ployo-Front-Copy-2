import DisableTwoFactorRequirementForm from "@/components/auth/DisableTwoFactorRequirementForm";
import TwoFactorSetupWizard from "@/components/auth/TwoFactorSetupWizard";
import { ctaClass } from "@/components/dashboard/ui";
import { auth } from "@/lib/auth";
import { getAccountOverview } from "@/lib/account-service";
import { prisma } from "@/lib/prisma";
import { isTenantOwner } from "@/lib/settings-service";
import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";

export const metadata = {
  title: "Zwei-Faktor-Authentifizierung erforderlich",
};

export default async function TwoFactorRequiredPage({
  params,
}: PageProps<"/u/[tenant]/zwei-faktor-erforderlich">) {
  const t = await getTranslations("TwoFactorRequiredPage");
  const { tenant } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const [account, isOwner, membership] = await Promise.all([
    getAccountOverview(),
    isTenantOwner(tenant),
    session?.user?.id
      ? prisma.tenantMembership.findFirst({
          where: { userId: session.user.id, tenant: { slug: tenant } },
          select: { tenant: { select: { name: true } } },
        })
      : null,
  ]);

  return (
    <section className="mx-auto mt-[clamp(0px,4vh,40px)] flex w-full max-w-[460px] flex-col gap-5 rounded-[18px] border border-[#ecebe7] bg-white px-[clamp(20px,4vw,34px)] py-8 shadow-[0_24px_70px_-30px_rgba(139,110,212,0.45)]">
      <div className="flex gap-2.5 rounded-[12px] border border-[rgba(139,111,224,0.3)] bg-[rgba(139,111,224,0.08)] px-3.5 py-3 text-[13.5px] leading-[1.5] text-[#4b3a8c]">
        <ShieldCheck size={17} className="mt-0.5 shrink-0" />
        <span>
          {t.rich("banner", {
            company: membership?.tenant.name ?? tenant,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </span>
      </div>

      {account.twoFactorEnabled ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="m-0 font-display text-[22px] font-semibold tracking-[-0.5px]">{t("alreadyActiveTitle")}</h1>
          <p className="m-0 text-[14px] text-[#6e6e6b]">{t("alreadyActiveBody")}</p>
          <Link href={`/u/${tenant}`} className={ctaClass}>
            {t("continueToDashboard")}
          </Link>
        </div>
      ) : (
        <TwoFactorSetupWizard continueHref={`/u/${tenant}`} />
      )}

      {isOwner && !account.twoFactorEnabled && <DisableTwoFactorRequirementForm tenant={tenant} />}
    </section>
  );
}
