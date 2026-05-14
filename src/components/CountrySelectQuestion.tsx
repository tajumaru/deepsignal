import type { FormField } from "../types";
import { CountryPicker } from "./CountryPicker";

interface CountrySelectQuestionProps {
  field: FormField;
  value: unknown;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  onChange: (value: unknown) => void;
}

export function CountrySelectQuestion({
  field,
  value,
  error,
  disabled,
  required,
  onChange,
}: CountrySelectQuestionProps) {
  return (
    <CountryPicker
      value={typeof value === "string" ? value : ""}
      onChange={onChange}
      placeholder={field.placeholder?.trim() || "Search or select a country"}
      disabled={disabled}
      required={required ?? field.required}
      allowClear={!(required ?? field.required)}
      ariaInvalid={Boolean(error)}
      ariaDescribedBy={error ? `${field.id}-error` : undefined}
    />
  );
}
