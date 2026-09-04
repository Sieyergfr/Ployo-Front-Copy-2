import { ReactNode } from "react";

type CheckboxProps = {
  id: string;
  defaultChecked?: boolean;
  children: ReactNode;
  alignItems?: 'center' | 'start' | 'end';
};

// Volle Klassennamen literal aufschreiben statt per Template-String
// zusammenzusetzen — Tailwinds Scanner erkennt nur statisch im Quelltext
// vorkommende Klassennamen, keine zur Laufzeit gebauten Strings.
const alignItemsClassName: Record<NonNullable<CheckboxProps["alignItems"]>, string> = {
  center: "items-center",
  start: "items-start",
  end: "items-end",
};

export default function Checkbox({
  id,
  defaultChecked = false,
  children,
  alignItems = "center"
}: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={`checkbox-row cursor-pointer ${alignItemsClassName[alignItems]}`}
    >
      <input
        id={id}
        name={id}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />

      <div
        className={`
          checkbox
          peer-checked:border-ink
          peer-checked:bg-ink
          peer-checked:text-white
          peer-focus-visible:ring-2
          peer-focus-visible:ring-ink/20
          ${alignItems == "start" && " mt-0.5"}
        `}
      />

      <span className="checkbox-label">
        {children}
      </span>
    </label>
  );
}
