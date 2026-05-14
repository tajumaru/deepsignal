import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { findCountryOption, getCountryOptions } from "../lib/countries";

interface CountryPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
}

export function CountryPicker({
  value,
  onChange,
  placeholder,
  disabled,
  required,
  allowClear,
  ariaInvalid,
  ariaDescribedBy,
}: CountryPickerProps) {
  const { language } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shellRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const selected = value ? findCountryOption(value, language) : null;
  const options = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const countryOptions = getCountryOptions(language);
    if (!normalizedQuery) {
      return countryOptions;
    }
    return countryOptions.filter((option) => option.searchText.includes(normalizedQuery));
  }, [language, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!shellRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  return (
    <div className={`country-picker ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`} ref={shellRef}>
      <button
        type="button"
        className={`country-picker-trigger ${ariaInvalid ? "is-error" : ""}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`country-picker-value ${selected ? "has-selection" : ""}`}>
          {selected ? (
            <>
              <span className="country-picker-flag" aria-hidden="true">
                {selected.flag}
              </span>
              <span className="country-picker-copy">
                <strong>{selected.name}</strong>
                <small>ISO: {selected.code}</small>
              </span>
            </>
          ) : (
            <span className="country-picker-placeholder">{placeholder ?? "Search or select a country"}</span>
          )}
        </span>
        <span className="country-picker-caret" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <div className="country-picker-panel">
          <div className="country-picker-toolbar">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search country or ISO code"
            />
            {allowClear && value && !required ? (
              <button
                type="button"
                className="ghost-button country-picker-clear"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="country-picker-list" role="listbox">
            {options.length > 0 ? (
              options.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  className={`country-picker-option ${option.code === value ? "is-selected" : ""}`}
                  role="option"
                  aria-selected={option.code === value}
                  onClick={() => {
                    onChange(option.code);
                    setOpen(false);
                  }}
                >
                  <span className="country-picker-flag" aria-hidden="true">
                    {option.flag}
                  </span>
                  <span className="country-picker-option-copy">
                    <strong>{option.name}</strong>
                    <small>{option.code}</small>
                  </span>
                </button>
              ))
            ) : (
              <p className="country-picker-empty">No countries match that search.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
