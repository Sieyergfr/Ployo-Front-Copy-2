"use client";

import { useState } from "react";

const OTHER_VALUE = "__other__";

export type SelectOrOtherOption = {
  value: string;
  label: string;
};

/**
 * Auswahlfeld mit gängigen Optionen + "Sonstige" — bei "Sonstige" erscheint
 * statt des Selects ein Freitextfeld mit demselben `name`, damit der Wert
 * unabhängig vom gewählten Eingabemodus unter demselben Formularfeld
 * ankommt (nie Select UND Input gleichzeitig im DOM).
 */
export default function SelectOrOtherField({
  id,
  name,
  options,
  defaultValue,
  placeholder = "Bitte wählen",
  otherPlaceholder = "Bitte angeben",
  form,
}: {
  id: string;
  name: string;
  options: SelectOrOtherOption[];
  defaultValue: string;
  placeholder?: string;
  otherPlaceholder?: string;
  form?: string;
}) {
  const isKnownValue =
    defaultValue === "" || options.some((option) => option.value === defaultValue);
  const [mode, setMode] = useState<"select" | "other">(isKnownValue ? "select" : "other");
  const [otherValue, setOtherValue] = useState(isKnownValue ? "" : defaultValue);

  if (mode === "other") {
    return (
      <div className="flex gap-2">
        <input
          id={id}
          name={name}
          form={form}
          className="input bg-white"
          value={otherValue}
          onChange={(event) => setOtherValue(event.target.value)}
          placeholder={otherPlaceholder}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm shrink-0 px-3"
          onClick={() => setMode("select")}
        >
          Liste
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      name={name}
      form={form}
      className="input cursor-pointer bg-white"
      defaultValue={defaultValue}
      onChange={(event) => {
        if (event.target.value === OTHER_VALUE) {
          setMode("other");
        }
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      <option value={OTHER_VALUE}>Sonstige</option>
    </select>
  );
}
