import AuthHeader from "@/components/AuthHeader";
import CompanyCreateWizard from "@/components/CompanyCreate/CompanyCreateWizard";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Unternehmen erstellen",
};

export default async function CreateCompanyPage() {
  const t = await getTranslations("CreateCompanyPage");

  return (
    <main className="min-h-svh overflow-y-auto bg-bg px-6 py-11">
      <div className="mx-auto flex w-full flex-col items-center">
        <div className="mx-auto mb-6 w-full max-w-[420px]">
          <AuthHeader />
        </div>
        <CompanyCreateWizard />
        <footer className="footer">
          <span className="footer-text">© {new Date().getFullYear()} Ployo · </span>
          <a href="/datenschutz" className="footer-link">
            {t("privacy")}
          </a>
          <span className="footer-text"> · </span>
          <a href="/impressum" className="footer-link">
            {t("imprint")}
          </a>
        </footer>
      </div>
    </main>
  );
}
