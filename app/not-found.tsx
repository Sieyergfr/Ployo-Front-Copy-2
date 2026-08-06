import Link from "next/link";

export const metadata = {
  title: "Seite nicht gefunden",
};

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-sm text-muted">404</p>
      <p className="text-3xl font-semibold text-ink">Seite nicht gefunden</p>
      <p className="max-w-md text-sm text-muted">
        Die angeforderte Seite existiert nicht oder wurde verschoben.
      </p>
      <Link href="/" className="btn btn-primary">
        Zur Startseite
      </Link>
    </div>
  );
}
