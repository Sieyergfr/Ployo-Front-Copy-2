import { SecondaryButton } from "@/components/Buttons/PrimaryButton";
import Divider from "@/components/Divider";
import { Mail, RefreshCcw, RotateCcw } from "lucide-react";

export const metadata = {
  title: "E-Mail bestätigen",
};

export default function ConfirmPage() {
    return (
        <>
            <div className="flex items-center justify-center">
                <div className="floating-circle animate-float">
                    <Mail size={32} />
                </div>
            </div>
            <div className="flex flex-col gap-3">
                <p className="card-heading text-center">E-Mail bestätigen</p>
                <div className="flex flex-col items-center gap-1.5">
                    <p className="description text-center">Wir haben einen Bestätigungslink an</p>
                    <div className="pill mt-2">
                        <Mail size={12} strokeWidth={2} color="#6E6E6B" />
                        <span className="pill-label">
                            mein@unternehmen.de
                        </span>
                    </div>
                    <p className="description text-center">gesendet. Bitte prüfen Sie Ihr Postfach und klicken Sie auf den Link, um Ihr Konto zu aktivieren.</p>
                </div>
            </div>
            <Divider />
            <div className="flex flex-col gap-2">
                <p className="text-muted text-center text-xs">Keine E-Mail erhalten?</p>
                <SecondaryButton>
                    <RotateCcw size={14} />
                    <p className="">E-Mail erneut senden</p>
                </SecondaryButton>
            </div>
        </>
    )
}
