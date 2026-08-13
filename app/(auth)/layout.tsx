import AuthHeader from "@/components/AuthHeader";
import AuthSegmented from "@/components/AuthSegmented";
import Card from "@/components/Card/card";

export default function AuthLayout ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
    return (
        <div className="min-h-svh flex items-center justify-center p-6">
            <div className="w-full" style={{ maxWidth: '420px' }}>
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
                        Datenschutz
                    </a>

                    <span className="footer-text">
                        {" "}·{" "}
                    </span>

                    <a href="/impressum" className="footer-link">
                        Impressum
                    </a>
                </footer>
            </div>
        </div>
    )
}