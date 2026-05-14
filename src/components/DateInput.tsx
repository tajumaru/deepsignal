import { useState, type ChangeEvent } from "react";

interface DateInputProps {
  value: string;
  language: "en" | "ja";
  disabled?: boolean;
  readOnly?: boolean;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  onChange?: (value: string) => void;
}

export function DateInput({
  value,
  language,
  disabled,
  readOnly,
  ariaInvalid,
  ariaDescribedBy,
  onChange,
}: DateInputProps) {
  const [focused, setFocused] = useState(false);
  const placeholder = language === "ja" ? "年/月/日" : "mm/dd/yyyy";
  const inputLang = language === "ja" ? "ja-JP" : "en-US";
  const showPlaceholder = !value && !focused;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange?.(event.target.value);
  }

  return (
    <span className={`date-input-shell ${showPlaceholder ? "is-empty" : ""} ${focused ? "is-focused" : ""}`}>
      <input
        type="date"
        lang={inputLang}
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={handleChange}
      />
      {showPlaceholder ? <span className="date-input-placeholder">{placeholder}</span> : null}
    </span>
  );
}
