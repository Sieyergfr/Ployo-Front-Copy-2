import BillingGateDialog from "@/components/BillingGateDialog";
import { getTenantBillingGate } from "@/lib/billing-service";
import { prisma } from "@/lib/prisma";
import { planEmployeeLimits } from "@/lib/stripe/plans";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Abo erforderlich",
};

/**
 * Ziel von withAccessRedirect bei "SUBSCRIPTION_REQUIRED" (lib/tenant-access.ts).
 * Die eigentliche Sperre liegt in der Datenschicht — diese Seite erklärt sie
 * nur und bietet den passenden Weg zum Entsperren an.
 */
export default async function SubscriptionRequiredPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant } = await params;
  const query = await searchParams;
  const gate = await getTenantBillingGate(tenant);

  if (!gate) {
    redirect("/select");
  }

  if (!gate.reason) {
    redirect(`/u/${tenant}`);
  }

  // Mitgliedschaft ist durch getTenantBillingGate bereits geprüft.
  const [employeeCount, tenantPlan] = await Promise.all([
    prisma.tenantEmployee.count({ where: { tenant: { slug: tenant }, status: { not: "former" } } }),
    prisma.tenant.findUnique({ where: { slug: tenant }, select: { plan: true, billingCycle: true } }),
  ]);

  return (
    <BillingGateDialog
      employeeCount={employeeCount}
      planLimits={planEmployeeLimits}
      currentPlan={tenantPlan?.plan}
      currentCycle={tenantPlan?.billingCycle}
      tenant={tenant}
      tenantName={gate.tenantName}
      reason={gate.reason}
      canManage={gate.canManage}
      awaitingConfirmation={query.checkout === "success"}
    />
  );
}
