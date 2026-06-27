import PrimaryButton from "@/components/Buttons/PrimaryButton";
import Card from "@/components/Card/card";
import CardHeader from "@/components/Card/CardHeader";
import Checkbox from "@/components/inputs/checkbox";
import PasswordInput from "@/components/inputs/password-input";
import SegmentedLinks from "@/components/segmented/SegmentedLinks";
import TextInput from "@/components/inputs/text-input";
import { ArrowRight } from "lucide-react";

export default function LoginPage() {
    return (
        <>
            <CardHeader title="Willkommen zurück" subtitle="Bitte melden Sie sich mit Ihrem Konto an." />
            <div className="card-form">
                <TextInput id="email" label="E-Mail" type="email" placeholder="name@unternehmen.de" />
                <PasswordInput id="email" label="Passwort" placeholder="password" />
                <Checkbox id="stay_logged">
                    <span>Angemeldet bleiben</span>
                </Checkbox>
            </div>
            <PrimaryButton>
                <span className="leading-tight">Anmelden</span>
                <ArrowRight size={12} strokeWidth={3} color="currentColor" />
            </PrimaryButton>
        </>
    )
}