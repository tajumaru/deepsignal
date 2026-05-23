import type { FieldType } from "../types";

export const fieldTypeLabels: Record<FieldType, string> = {
  shortText: "Short text",
  longText: "Long text",
  markdown: "Rich text / Markdown",
  date: "Date",
  dropdown: "Dropdown",
  checkbox: "Checkboxes",
  matrix: "Matrix Grid",
  country_select: "Country select",
  confirmation: "Confirmation checkbox",
  rating: "Star rating",
  emotionRating: "Emotion scale",
  url: "URL",
  walletAddress: "SUI address",
  screenshot: "Screenshot upload",
  video: "Video upload",
  voice: "Voice answer",
};

export const fieldTypeOptions: FieldType[] = [
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
  "emotionRating",
  "url",
  "walletAddress",
  "screenshot",
  "video",
  "voice",
];
