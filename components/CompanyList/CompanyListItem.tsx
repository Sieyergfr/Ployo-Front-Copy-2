import AvatarBlank from "../Avatar"

type Props = {
    title: string;
    industry: string;
}

export default function CompanyListItem({ title, industry }: Props) {
    return (
        <div className="list-card">
            <AvatarBlank letter="BB" />
            <div className="list-card-content">
                <div className="list-card-title">
                    { title }
                </div>
                <div className="list-card-meta">
                    <span className="list-card-meta-text">
                        { industry }
                    </span>
                </div>
            </div>
        </div>
    )
}