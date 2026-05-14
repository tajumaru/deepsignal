import type { Language } from "../i18n";
import type { FormField } from "../types";
import { formatCountryAnswerText } from "./countries";
import { flattenAnswer } from "./utils";

export function formatAnswerText(field: FormField | undefined, value: unknown, language: Language) {
  if (field?.type === "country_select" && typeof value === "string" && value.trim()) {
    return formatCountryAnswerText(value, language);
  }
  return flattenAnswer(value);
}
