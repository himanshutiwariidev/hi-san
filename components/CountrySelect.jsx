"use client";

import { useMemo, useRef, useState } from "react";
import { countries } from "@/lib/countries";

// Searchable multi-select modeled on the original .select2-* combobox.
export default function CountrySelect({ value, onChange, placeholder = "Search countries" }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return countries.filter((c) => !value.includes(c.code) && (!q || c.name.toLowerCase().includes(q)));
  }, [query, value]);

  const add = (code) => {
    onChange([...value, code]);
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <div
        className="flex min-h-[42px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-[10px] border border-border bg-surface py-1.5 pr-9 pl-2 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-accent-ring)]"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((code) => {
          const country = countries.find((c) => c.code === code);
          return (
            <span key={code} className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-border bg-surface-muted py-1 pr-2 pl-2.5 text-[13px] text-text">
              {country.name}
              <button
                type="button"
                aria-label={`Remove ${country.name}`}
                onClick={() => onChange(value.filter((c) => c !== code))}
                className="inline-flex size-[18px] items-center justify-center rounded-full border-0 bg-border p-0 text-xs font-bold text-muted hover:bg-border-strong hover:text-text"
              >
                ×
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          value={query}
          placeholder={value.length ? "" : placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && options[0]) {
              e.preventDefault();
              add(options[0].code);
            }
            if (e.key === "Backspace" && !query && value.length) onChange(value.slice(0, -1));
          }}
          className="min-h-7 w-auto min-w-[160px] flex-[180px] border-0 px-0.5 py-[3px] focus:outline-0"
        />
      </div>
      <span className="pointer-events-none absolute top-3.5 right-3 text-xs text-muted">▾</span>
      {open ? (
        <div className="absolute top-[calc(100%+6px)] right-0 left-0 z-20 max-h-[260px] overflow-auto rounded-[10px] border border-border bg-surface p-1.5 shadow-dropdown">
          {options.length ? (
            options.map((c) => (
              <button
                key={c.code}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(c.code)}
                className="block w-full rounded-[10px] border-0 bg-transparent px-2.5 py-2 text-left font-normal text-text hover:bg-surface-muted focus:bg-surface-muted focus:outline-0"
              >
                {c.name}
              </button>
            ))
          ) : (
            <span className="block px-2.5 py-2 text-[13px] text-muted">No results found</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
