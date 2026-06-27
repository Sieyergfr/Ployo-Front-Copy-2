"use client";

import { InputHTMLAttributes } from "react";
import { Search } from "lucide-react";

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export default function SearchInput({
  id,
  className = "",
  ...props
}: SearchInputProps) {
  return (
    <div className="input-wrapper">
      <Search
        size={15}
        strokeWidth={2}
        className="input-icon-left"
      />

      <input
        id={id}
        type="search"
        name={props.name ?? id}
        className={`input input-with-icon-left ${className}`}
        {...props}
      />
    </div>
  );
}