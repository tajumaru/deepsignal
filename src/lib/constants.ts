import type { FieldType } from "../types";

export const fieldTypeLabels: Record<FieldType, string> = {
  shortText: "Short text",
  longText: "Long text",
  dropdown: "Dropdown",
  checkbox: "Checkbox group",
  rating: "Rating",
  url: "URL",
  screenshot: "Screenshot",
  video: "Video",
};

export const fieldTypeOptions: FieldType[] = [
  "shortText",
  "longText",
  "dropdown",
  "checkbox",
  "rating",
  "url",
  "screenshot",
  "video",
];
