import { useI18n } from "../i18n";
import { formatAnswerText } from "../lib/answerFormatting";
import { findCountryOption } from "../lib/countries";
import type { FormField } from "../types";

interface FormattedAnswerValueProps {
  field?: FormField;
  value: unknown;
  emptyLabel: string;
  showCountryIso?: boolean;
}

export function FormattedAnswerValue({
  field,
  value,
  emptyLabel,
  showCountryIso = false,
}: FormattedAnswerValueProps) {
  const { language } = useI18n();

  if (field?.type === "country_select" && typeof value === "string" && value.trim()) {
    const country = findCountryOption(value, language);
    if (country) {
      return (
        <span className={`formatted-answer-value country-answer-value ${showCountryIso ? "show-iso" : ""}`}>
          <span className="country-answer-main">
            {country.flag} {country.name}
          </span>
          {showCountryIso ? <span className="country-answer-iso">ISO: {country.code}</span> : null}
        </span>
      );
    }
  }

  const text = formatAnswerText(field, value, language).trim();
  return <span className="formatted-answer-value">{text || emptyLabel}</span>;
}
