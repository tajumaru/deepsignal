import type { Language } from "../i18n";
import type { FormField } from "../types";
import { formatCountryAnswerText } from "./countries";
import { isConfirmationCheckboxField, normalizeFieldType } from "./fieldTypes";
import { flattenAnswer } from "./utils";

function formatDateAnswerText(value: string, language: Language) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatAnswerText(field: FormField | undefined, value: unknown, language: Language) {
  const fieldType = field ? normalizeFieldType(field.type) : undefined;
  if (fieldType === "country_select" && typeof value === "string" && value.trim()) {
    return formatCountryAnswerText(value, language);
  }
  if (fieldType === "date" && typeof value === "string" && value.trim()) {
    return formatDateAnswerText(value, language);
  }
  if (fieldType && isConfirmationCheckboxField(fieldType)) {
    return value === true ? "Confirmed" : "Not confirmed";
  }
  if (fieldType === "matrix" && value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>)
      .map(([row, column]) => `${row}: ${String(column ?? "")}`)
      .join(" | ");
  }
  return flattenAnswer(value);
}
