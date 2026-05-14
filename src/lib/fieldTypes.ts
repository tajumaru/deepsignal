import type { FieldType } from "../types";

const FIELD_TYPES: FieldType[] = [
  "shortText",
  "longText",
  "markdown",
  "date",
  "dropdown",
  "checkbox",
  "country_select",
  "confirmationCheckbox",
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

export function isLongTextLikeField(type: FieldType) {
  return type === "longText" || type === "markdown";
}

export function isAttachmentFieldType(type: FieldType) {
  return type === "screenshot" || type === "video";
}

export function isConfirmationCheckboxField(type: FieldType) {
  return type === "confirmationCheckbox";
}
