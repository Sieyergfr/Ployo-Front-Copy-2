type TPProps = {
    label: string;
    placeholder: string;
    id: string;
}

export default function EmailInput({ label, placeholder, id }: TPProps) {
    return (
        <div className="field">
            <label htmlFor={id} className="label">{ label }</label>
            <input type="email" name={id} id={id} className="input" placeholder={placeholder} />
        </div>
    )
}