import PageHeader from "@/components/PageHeader";
import PrintPageButton from "@/components/PrintPageButton";
import { getTenantProcessingRegister } from "@/lib/processing-register";
import { withAccessRedirect } from "@/lib/tenant-access";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Verzeichnis von Verarbeitungstätigkeiten",
};

export default async function ProcessingRegisterPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const [entries, t] = await Promise.all([
    withAccessRedirect(tenant, () => getTenantProcessingRegister(tenant)),
    getTranslations("ProcessingRegisterPage"),
  ]);

  return (
    <div>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")}>
        <PrintPageButton>{t("printButton")}</PrintPageButton>
      </PageHeader>

      {entries.length === 0 ? (
        <section className="rounded-card border border-border bg-white px-6 py-[22px]">
          <p className="text-[13px] text-muted-2">{t("emptyState")}</p>
        </section>
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map((entry) => (
            <section
              key={entry.id}
              className="rounded-card border border-border bg-white px-6 py-[22px]"
            >
              <h2 className="mb-[18px] font-display text-[16px] font-semibold tracking-[-0.3px] text-ink">
                {entry.title}
              </h2>
              <dl className="grid gap-y-[14px] gap-x-6 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                <div>
                  <dt className="font-mono text-[9px] uppercase tracking-[0.5px] text-muted">
                    {t("colZweck")}
                  </dt>
                  <dd className="mt-[5px] text-[13.5px] text-ink">{entry.zweck}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[9px] uppercase tracking-[0.5px] text-muted">
                    {t("colBetroffene")}
                  </dt>
                  <dd className="mt-[5px] text-[13.5px] text-ink">{entry.betroffenePersonen}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[9px] uppercase tracking-[0.5px] text-muted">
                    {t("colDaten")}
                  </dt>
                  <dd className="mt-[5px] text-[13.5px] text-ink">{entry.datenkategorien}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[9px] uppercase tracking-[0.5px] text-muted">
                    {t("colRechtsgrundlage")}
                  </dt>
                  <dd className="mt-[5px] text-[13.5px] text-ink">{entry.rechtsgrundlage}</dd>
                </div>
                {entry.empfaenger && (
                  <div>
                    <dt className="font-mono text-[9px] uppercase tracking-[0.5px] text-muted">
                      {t("colEmpfaenger")}
                    </dt>
                    <dd className="mt-[5px] text-[13.5px] text-ink">{entry.empfaenger}</dd>
                  </div>
                )}
                <div>
                  <dt className="font-mono text-[9px] uppercase tracking-[0.5px] text-muted">
                    {t("colLoeschfrist")}
                  </dt>
                  <dd className="mt-[5px] text-[13.5px] text-ink">{entry.loeschfrist}</dd>
                </div>
              </dl>
            </section>
          ))}
        </div>
      )}

      <p className="mt-4 text-[11.5px] leading-[1.5] text-muted">{t("footnote")}</p>
    </div>
  );
}
