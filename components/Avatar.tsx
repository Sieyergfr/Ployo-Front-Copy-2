type Props = {
    letter: string;
}

export default function AvatarBlank({ letter }: Props) {
    return (
        <div className="avatar">
            <span className="avatar-text">
                { letter }
            </span>
        </div>
    )
}