import type { FieldType } from "../types";

export const fieldTypeLabels: Record<FieldType, string> = {
  shortText: "Short text",
  longText: "Long text",
  markdown: "Rich text / Markdown",
  date: "Date",
  dropdown: "Dropdown",
  checkbox: "Checkboxes",
  country_select: "Country select",
  confirmationCheckbox: "Confirmation checkbox",
  rating: "Star rating",
  url: "URL",
  screenshot: "Screenshot upload",
  video: "Video upload",
};

export const fieldTypeOptions: FieldType[] = [
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
