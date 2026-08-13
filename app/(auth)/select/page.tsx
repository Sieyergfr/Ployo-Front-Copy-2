import CardHeader from "@/components/Card/CardHeader";
import CompanyList from "@/components/CompanyList/CompanyList";
import CompanyListItem from "@/components/CompanyList/CompanyListItem";
import SearchInput from "@/components/inputs/SearchInput";
import { auth } from "@/lib/auth";
import { getOwnPreferences, getOwnScheduledDeletion, startPagePath } from "@/lib/account-service";
import { getTenantsForUser } from "@/lib/tenants";
import { ArrowRight } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Unternehmen auswählen",
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
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

  const [memberships, preference] = await Promise.all([
    getTenantsForUser(session.user.id),
    getOwnPreferences(),
  ]);

  return (
    <>
      <CardHeader
        title="Unternehmen auswählen"
        subtitle="Mit welchem Unternehmen möchten Sie fortfahren?"
      />
      <SearchInput placeholder="Unternehmen suchen..." />
      <CompanyList>
        {memberships.length === 0 ? (
          <div className="rounded-[12px] border border-border bg-bg px-4 py-3 text-[13px] text-muted-2">
            Noch kein Unternehmen angelegt.
          </div>
        ) : (
          memberships.map((membership) => (
            <CompanyListItem
              key={membership.tenant.id}
              href={startPagePath(membership.tenant.slug, preference.startPage)}
              title={membership.tenant.name}
              industry={membership.tenant.industry}
              initials={getInitials(membership.tenant.name)}
            />
          ))
        )}
      </CompanyList>
      <Link href="/select/create" className="btn btn-block btn-primary">
        <span>Neues Unternehmen erstellen</span>
        <ArrowRight size={12} strokeWidth={3} />
      </Link>
    </>
  );
}
