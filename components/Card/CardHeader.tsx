type Props = {
    title: string;
    subtitle: string;
}

export default function CardHeader({ title, subtitle }: Props) {
    return (
        <div className="mb-5.5">
            <p className="card-heading">{ title }</p>
            <p className="card-text-muted">{ subtitle }</p>
        </div>
    )
}