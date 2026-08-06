import Image from "next/image";
import Link from "next/link";
import {
  CalendarDays,
  FileText,
  ShieldCheck,
  Users,
} from "lucide-react";

export const metadata = {
  title: "Digitale Personalakte für KMU",
};

const features = [
  {
    icon: Users,
    title: "Mitarbeiterverwaltung",
    description:
      "Alle Stammdaten, Verträge und Dokumente Ihrer Mitarbeiter an einem sicheren Ort.",
  },
  {
    icon: CalendarDays,
    title: "Schicht- & Urlaubsplanung",
    description:
      "Schichtpläne, Urlaubsanträge und Krankmeldungen ohne Zettelwirtschaft verwalten.",
  },
  {
    icon: FileText,
    title: "Dokumente & Erinnerungen",
    description:
      "Fristen im Blick behalten – mit Ablagestruktur, Versionierung und automatischen Erinnerungen.",
  },
  {
    icon: ShieldCheck,
    title: "Datenschutz zuerst",
    description:
      "Hosting und Dokumentenspeicher in der EU, rollenbasierte Zugriffe und Audit-Protokoll.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <Image
            src="/logo_square_brand.svg"
            alt="Ployo Logo"
            width={28}
            height={28}
          />
          <span className="text-lg font-semibold text-ink">Ployo</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link href="/login" className="btn btn-secondary">
            Anmelden
          </Link>
          <Link href="/register" className="btn btn-primary">
            Kostenlos starten
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6">
        <section className="flex flex-col items-center gap-6 py-20 text-center">
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
            Die digitale Personalakte für kleine und mittlere Unternehmen
          </h1>
          <p className="max-w-xl text-base leading-7 text-muted">
            Mitarbeiterdaten, Schichtplanung, Urlaub, Krankmeldungen und
            HR-Dokumente – DSGVO-konform an einem Ort, statt verteilt über
            Ordner, Excel und E-Mail.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className="btn btn-primary px-6 py-3">
              Jetzt Konto erstellen
            </Link>
            <Link href="/login" className="btn btn-secondary px-6 py-3">
              Ich habe bereits ein Konto
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="flex flex-col gap-2 rounded-2xl border border-border-soft bg-white p-6"
            >
              <feature.icon size={20} className="text-ink" aria-hidden />
              <p className="text-sm font-semibold text-ink">{feature.title}</p>
              <p className="text-sm leading-6 text-muted">
                {feature.description}
              </p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border-soft">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-5 text-[12.5px] text-muted">
          <span>© {new Date().getFullYear()} Ployo</span>
          <nav className="flex gap-4">
            <Link href="/datenschutz" className="hover:text-ink">
              Datenschutz
            </Link>
            <Link href="/impressum" className="hover:text-ink">
              Impressum
            </Link>
            <Link href="/agb" className="hover:text-ink">
              AGB
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
