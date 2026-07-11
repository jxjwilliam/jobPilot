"use client";

import { useEffect, useState } from "react";

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  label: string;
  placeholder?: string;
  className?: string;
};

/** Keeps a draft string so spaces/commas work while typing; commits to list on blur. */
export function CsvListInput({
  value,
  onChange,
  label,
  placeholder,
  className,
}: Props) {
  const [draft, setDraft] = useState(() => value.join(", "));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(value.join(", "));
    }
  }, [value, focused]);

  function commit(raw: string) {
    const next = raw
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    onChange(next);
    setDraft(next.join(", "));
  }

  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        className={
          className ??
          "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        }
        value={draft}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false);
          commit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}
