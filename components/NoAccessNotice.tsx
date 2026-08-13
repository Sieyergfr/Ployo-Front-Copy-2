import { ShieldAlert } from "lucide-react";
import Link from "next/link";

export default function NoAccessNotice({ tenant }: { tenant: string }) {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-card border border-border bg-white px-6 py-14 text-center">
      <ShieldAlert className="text-muted" size={32} />
      <h1 className="font-display text-[19px] font-semibold text-ink">
        Kein Zugriff auf diesen Bereich
      </h1>
      <p className="text-[13.5px] leading-[1.6] text-muted">
        Für Ihr Konto ist dieser Bereich nicht freigeschaltet. Falls Sie
        glauben, dass das nicht stimmt, wenden Sie sich bitte an Ihre
        HR-Abteilung.
      </p>
      <Link href={`/u/${tenant}/mein-bereich`} className="btn btn-primary">
        Zu Mein Bereich
      </Link>
    </section>
  );
}
