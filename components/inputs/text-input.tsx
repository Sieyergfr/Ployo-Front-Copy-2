import { InputHTMLAttributes } from "react";

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export default function TextInput({
  label,
  id,
  className = "",
  ...props
}: TextInputProps) {
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label}
      </label>

      <div className="input-wrapper">
        <input
          id={id}
          name={props.name ?? id}
          className={`input input-mono ${className}`}
          {...props}
        />
      </div>
    </div>
  );
}