import PrimaryButton from "@/components/Buttons/PrimaryButton";
import CardHeader from "@/components/Card/CardHeader";
import Checkbox from "@/components/inputs/checkbox";
import PasswordInput from "@/components/inputs/password-input";
import TextInput from "@/components/inputs/text-input";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
    return (
        <>
            <CardHeader title="Konto erstellen" subtitle="Füllen Sie die Felder aus, um loszulegen." />
            <div className="card-form">
                <div className="card-form-grid">
                    <TextInput id="firstName" type="text" label="Vorname" placeholder="Anna" />
                    <TextInput id="lastName" type="text" label="Nachname" placeholder="Müller" />
                </div>
                <TextInput id="email" type="email" label="E-Mail" placeholder="name@unternehmen.de" />
                <PasswordInput showStrength id="password" label="Passwort" placeholder="password" />
                <PasswordInput id="password_repeat" label="Passwort wiederholen" placeholder="password" />

                <Checkbox id="terms" alignItems="start">
                    Ich stimme den{" "}
                    <Link
                        href="/terms"
                        className="text-ink underline underline-offset-2"
                    >
                        Nutzungsbedingungen
                    </Link>{" "}
                    und der{" "}
                    <Link
                        href="/privacy"
                        className="text-ink underline underline-offset-2"
                    >
                        Datenschutzerklärung
                    </Link>{" "}
                    zu.
                </Checkbox>
            </div>
            <PrimaryButton>
                <span className="leading-tight">Anmelden</span>
                <ArrowRight size={12} strokeWidth={3} color="currentColor" />
            </PrimaryButton>
        </>
    )
}