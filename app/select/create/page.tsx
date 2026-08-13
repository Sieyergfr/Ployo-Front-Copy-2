import AuthHeader from "@/components/AuthHeader";
import CompanyCreateWizard from "@/components/CompanyCreate/CompanyCreateWizard";

export const metadata = {
  title: "Unternehmen erstellen",
};

export default function CreateCompanyPage() {
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
            Datenschutz
          </a>
          <span className="footer-text"> · </span>
          <a href="/impressum" className="footer-link">
            Impressum
          </a>
        </footer>
      </div>
    </main>
  );
}
