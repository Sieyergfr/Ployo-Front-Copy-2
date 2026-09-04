import AuthHeader from "@/components/AuthHeader";
import AuthSegmented from "@/components/AuthSegmented";
import Card from "@/components/Card/card";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { getTranslations } from "next-intl/server";

export default async function AuthLayout ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
    const t = await getTranslations("Auth.footer");

    return (
        <div className="min-h-svh flex items-center justify-center p-6">
            <div className="w-full max-w-[420px]">
                <AuthHeader />
                <AuthSegmented />
                <Card>
                    {children}
                </Card>
                <footer className="footer">
                    <span className="footer-text">
                        © {new Date().getFullYear()} Ployo ·{" "}
                    </span>

                    <a href="/datenschutz" className="footer-link">
                        {t("privacy")}
                    </a>

                    <span className="footer-text">
                        {" "}·{" "}
                    </span>

                    <a href="/impressum" className="footer-link">
                        {t("imprint")}
                    </a>

                    <span className="footer-text">
                        {" "}·{" "}
                    </span>

                    <LocaleSwitcher className="inline-flex items-center gap-1.5 align-middle" />
                </footer>
            </div>
        </div>
    )
}