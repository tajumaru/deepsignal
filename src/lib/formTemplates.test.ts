import { describe, expect, it } from "vitest";
import { createTemplateFields, getTemplateDefinition } from "./formTemplates";

describe("form template processing policies", () => {
  it("marks hybrid template aggregate fields and review fields explicitly", () => {
    const template = getTemplateDefinition("feature");
    const fields = createTemplateFields(template);

    expect(template.automation?.processingMode).toBe("hybrid");
    expect(fields.map((field) => [field.label, field.processingPolicy])).toEqual([
      ["Feature idea", "review"],
      ["What problem would this solve?", "review"],
      ["What would a good outcome look like?", "review"],
      ["Priority", "aggregate"],
    ]);
  });

  it("keeps review-required templates policy-neutral unless a field is sensitive", () => {
    const template = getTemplateDefinition("encrypted-report");
    const fields = createTemplateFields(template);

    expect(template.automation?.processingMode).toBe("review_required");
    expect(fields.find((field) => field.label === "Incident summary")?.processingPolicy).toBe("auto");
    expect(fields.find((field) => field.label === "What happened?")?.processingPolicy).toBe("review");
  });

  it("seeds auto-process templates with aggregate-safe structured fields", () => {
    const template = getTemplateDefinition("survey");
    const fields = createTemplateFields(template);

    expect(template.automation?.processingMode).toBe("auto_process");
    expect(fields.find((field) => field.type === "rating")?.processingPolicy).toBe("aggregate");
    expect(fields.find((field) => field.type === "checkbox")?.processingPolicy).toBe("aggregate");
    expect(fields.find((field) => field.type === "longText")?.processingPolicy).toBe("review");
  });
});
