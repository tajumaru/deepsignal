import type { FieldType } from "../types";

const FIELD_TYPES: FieldType[] = [
  "shortText",
  "longText",
  "markdown",
  "date",
  "dropdown",
  "checkbox",
  "matrix",
  "country_select",
  "confirmation",
  "rating",
  "url",
  "screenshot",
  "video",
];

export function normalizeFieldType(raw: unknown): FieldType {
  if (typeof raw !== "string") {
    return "shortText";
  }
  if ((FIELD_TYPES as string[]).includes(raw)) {
    return raw as FieldType;
  }
  switch (raw) {
    case "richText":
    case "markdownTextarea":
      return "markdown";
    case "checkboxes":
      return "checkbox";
    case "grid":
    case "matrixGrid":
    case "singleChoiceMatrix":
      return "matrix";
    case "confirmationCheckbox":
    case "confirmation_checkbox":
    case "consent":
    case "consentCheckbox":
      return "confirmation";
    case "countrySelect":
      return "country_select";
    case "starRating":
      return "rating";
    case "screenshotUpload":
      return "screenshot";
    case "videoUpload":
      return "video";
    default:
      return "shortText";
  }
}

export function hasChoiceOptions(type: FieldType) {
  return type === "dropdown" || type === "checkbox";
}

export function isMatrixFieldType(type: FieldType) {
  return type === "matrix";
}

export function isLongTextLikeField(type: FieldType) {
  return type === "longText" || type === "markdown";
}

export function isAttachmentFieldType(type: FieldType) {
  return type === "screenshot" || type === "video";
}

export function isConfirmationCheckboxField(type: FieldType) {
  return type === "confirmation";
}
