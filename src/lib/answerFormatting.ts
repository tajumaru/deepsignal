import type { Language } from "../i18n";
import type { FormField } from "../types";
import { formatCountryAnswerText } from "./countries";
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
  if (field?.type === "country_select" && typeof value === "string" && value.trim()) {
    return formatCountryAnswerText(value, language);
  }
  if (field?.type === "date" && typeof value === "string" && value.trim()) {
    return formatDateAnswerText(value, language);
  }
  return flattenAnswer(value);
}
