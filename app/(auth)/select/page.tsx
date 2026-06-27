import PrimaryButton from "@/components/Buttons/PrimaryButton";
import CardHeader from "@/components/Card/CardHeader";
import CompanyList from "@/components/CompanyList/CompanyList";
import CompanyListItem from "@/components/CompanyList/CompanyListItem";
import SearchInput from "@/components/inputs/SearchInput";
import { ArrowRight } from "lucide-react";

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
            <PrimaryButton>
                <span>Neues Unternehmen erstellen</span>
                <ArrowRight size={12} strokeWidth={3} />
            </PrimaryButton>
        </>
    )
}