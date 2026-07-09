import Link from "next/link";
import AvatarBlank from "../Avatar";

type Props = {
  href: string;
  title: string;
  industry?: string | null;
  initials?: string;
}

export default function CompanyListItem({
  href,
  title,
  industry,
  initials = title.slice(0, 2).toUpperCase(),
}: Props) {
  return (
    <Link href={href} className="list-card no-underline">
      <AvatarBlank letter={initials} />
      <div className="list-card-content">
        <div className="list-card-title">{title}</div>
        <div className="list-card-meta">
          <span className="list-card-meta-text">
            {industry || "Unternehmen"}
          </span>
        </div>
      </div>
    </Link>
  );
}
