import CardHeader from "@/components/Card/CardHeader";
import CompanyList from "@/components/CompanyList/CompanyList";
import CompanyListItem from "@/components/CompanyList/CompanyListItem";
import SearchInput from "@/components/inputs/SearchInput";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Unternehmen auswählen",
};

export default function TenantSelectPage() {
    return (
        <>
            <CardHeader title="Unternehmen auswählen" subtitle="Mit welchem Unternehmen möchten Sie fortfahren?" />
            <SearchInput placeholder="Unternehmen suchen..." />
            <CompanyList>
                <CompanyListItem title="B&B Holding GmbH" industry="Hotellerie" />
                <CompanyListItem title="B&B Holding GmbH" industry="Hotellerie" />
                <CompanyListItem title="B&B Holding GmbH" industry="Hotellerie" />
                <CompanyListItem title="B&B Holding GmbH" industry="Hotellerie" />
                <CompanyListItem title="B&B Holding GmbH" industry="Hotellerie" />
                <CompanyListItem title="B&B Holding GmbH" industry="Hotellerie" />
            </CompanyList>
            <Link href="/select/create" className="btn btn-block btn-primary">
                <span>Neues Unternehmen erstellen</span>
                <ArrowRight size={12} strokeWidth={3} />
            </Link>
        </>
    )
}
