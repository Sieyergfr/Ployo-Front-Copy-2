import { auth } from "@/lib/auth";
import { getTenantsForUser } from "@/lib/tenants";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Erinnerungen",
};

export default async function RemindersShortcutPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect("/login");
  }

  const memberships = await getTenantsForUser(session.user.id);
  const tenantSlug = memberships[0]?.tenant.slug;

  if (!tenantSlug) {
    redirect("/select");
  }

  redirect(`/u/${tenantSlug}/erinnerungen`);
}
