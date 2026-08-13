import { ReactNode } from "react";

type CheckboxProps = {
  id: string;
  defaultChecked?: boolean;
  children: ReactNode;
  alignItems?: 'center' | 'start' | 'end';
};

export default function Checkbox({
  id,
  defaultChecked = false,
  children,
  alignItems = "center"
}: CheckboxProps) {
  return (
    <label htmlFor={id} className="checkbox-row cursor-pointer" style={{ alignItems }}>
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
