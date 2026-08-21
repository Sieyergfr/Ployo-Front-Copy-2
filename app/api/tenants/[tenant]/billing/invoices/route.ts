import { auth } from "@/lib/auth";
import { getBillingInvoices } from "@/lib/billing-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Rechnungshistorie aus Stripe — für den "Abrechnung"-Tab (Web-Einstellungen), der bisher keine tatsächlichen Rechnungen zeigte. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-billing-invoices:${session.user.id}`,
    limit: 30,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const invoices = await getBillingInvoices(tenant);

    return Response.json({ invoices });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
