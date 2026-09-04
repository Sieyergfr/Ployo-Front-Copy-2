"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

type PasswordInputProps = {
  id: string;
  label?: string;
  placeholder?: string;
  showStrength?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export default function PasswordInput({
  id,
  label,
  placeholder,
  showStrength = false,
  value,
  onChange,
  className,
  ...props
}: PasswordInputProps) {
  const t = useTranslations("PasswordInput");
  const [show, setShow] = useState(false);
  const [internalValue, setInternalValue] = useState("");

  // Unterstützt controlled UND uncontrolled Nutzung
  const password =
    value !== undefined ? String(value) : internalValue;

  const strength = useMemo(() => {
    if (!showStrength) return 0;

    let score = 0;

    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    return score;
  }, [password, showStrength]);

  const strengthText = [
    "",
    t("strengthWeak"),
    t("strengthMedium"),
    t("strengthGood"),
    t("strengthStrong"),
  ];

  const strengthColor = [
    "bg-border",
    "bg-danger",
    "bg-warning",
    "bg-success",
    "bg-success",
  ];

  return (
    <div className="field">
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}

      <div className="input-wrapper">
        <input
          id={id}
          name={props.name ?? id}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            if (value === undefined) {
              setInternalValue(e.target.value);
            }

            onChange?.(e);
          }}
          className={`input input-mono input-with-icon-right ${className ?? ""}`}
          {...props}
        />

        <button
          type="button"
          className="input-icon-right"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? t("hidePassword") : t("showPassword")}
        >
          {show ? (
            <EyeOff size={16} strokeWidth={1.8} />
          ) : (
            <Eye size={16} strokeWidth={1.8} />
          )}
        </button>
      </div>

      {showStrength && (
        <>
          <div className="password-strength">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`password-strength-bar ${
                  i < strength
                    ? strengthColor[strength]
                    : "bg-border"
                }`}
              />
            ))}
          </div>

          <p className="password-strength-text">
            {strengthText[strength]}
          </p>
        </>
      )}
    </div>
  );
}