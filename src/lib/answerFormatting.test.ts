import { describe, expect, it } from "vitest";
import type { FormField } from "../types";
import { formatAnswerText } from "./answerFormatting";

describe("formatAnswerText", () => {
  it("renders star ratings as stars instead of raw numeric values", () => {
    const field = {
      id: "rating",
      type: "rating",
      label: "Signal strength",
      required: false,
      sensitive: false,
    } satisfies FormField;

    expect(formatAnswerText(field, "3", "en")).toBe("★★★☆☆");
    expect(formatAnswerText(field, 5, "en")).toBe("★★★★★");
  });

  it("keeps invalid rating-like values readable for legacy answers", () => {
    const field = {
      id: "rating",
      type: "rating",
      label: "Signal strength",
      required: false,
      sensitive: false,
    } satisfies FormField;

    expect(formatAnswerText(field, "00123", "en")).toBe("00123");
  });
});
