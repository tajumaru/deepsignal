import { describe, expect, it } from "vitest";
import type { FormSchema } from "../types";
import { classifyFormEdit, computeSchemaHash, isStructuralFormEdit, resolveFormVersion } from "./formVersioning";

function createForm(overrides: Partial<FormSchema> = {}): FormSchema {
  return {
    id: "form-versioning",
    title: "Signal intake",
    description: "Collect field signals",
    fields: [
      {
        id: "impact",
        type: "shortText",
        label: "Impact",
        required: true,
        sensitive: false,
      },
      {
        id: "severity",
        type: "rating",
        label: "Severity",
        required: false,
        sensitive: false,
      },
    ],
    sections: [],
    createdAt: "2026-05-28T00:00:00.000Z",
    ...overrides,
  };
}

describe("form versioning utilities", () => {
  it("keeps schemaHash stable for light edits", () => {
    const previous = createForm();
    const next = createForm({
      title: "Signal intake updated",
      description: "Collect better field signals",
      visibility: "public",
      responseDeadline: 3600,
      responseDeadlineMode: "relative",
    });

    expect(computeSchemaHash(next)).toBe(computeSchemaHash(previous));
    expect(classifyFormEdit(previous, next)).toEqual({
      classification: "light",
      lightFields: ["title", "description", "visibility", "responseDeadline", "responseDeadlineMode"],
      structuralFields: [],
    });
    expect(isStructuralFormEdit(previous, next)).toBe(false);
  });

  it("marks question text, type, required flag, options, and validation changes as structural", () => {
    const previous = createForm({
      fields: [
        {
          id: "impact",
          type: "dropdown",
          label: "Impact",
          required: true,
          sensitive: false,
          options: ["Low", "High"],
          validationHint: "Choose one",
        },
      ],
    });
    const next = createForm({
      fields: [
        {
          id: "impact",
          type: "checkbox",
          label: "Operational impact",
          required: false,
          sensitive: false,
          options: ["Low", "Medium", "High"],
          validationHint: "Choose all that apply",
        },
      ],
    });

    const diff = classifyFormEdit(previous, next);
    expect(computeSchemaHash(next)).not.toBe(computeSchemaHash(previous));
    expect(diff.classification).toBe("structural");
    expect(diff.structuralFields).toEqual(["fields"]);
    expect(isStructuralFormEdit(previous, next)).toBe(true);
  });

  it("marks question add, remove, reorder, and section changes as structural", () => {
    const previous = createForm({
      sections: [{ id: "context", title: "Context" }],
      fields: [
        { id: "impact", type: "shortText", label: "Impact", required: true, sensitive: false, sectionId: "context" },
        { id: "severity", type: "rating", label: "Severity", required: false, sensitive: false },
      ],
    });
    const next = createForm({
      sections: [{ id: "context", title: "Operational context" }],
      fields: [
        { id: "severity", type: "rating", label: "Severity", required: false, sensitive: false },
        { id: "impact", type: "shortText", label: "Impact", required: true, sensitive: false, sectionId: "context" },
        { id: "owner", type: "shortText", label: "Owner", required: false, sensitive: false },
      ],
    });

    expect(classifyFormEdit(previous, next)).toMatchObject({
      classification: "structural",
      structuralFields: ["fields", "sections"],
    });
  });

  it("classifies simultaneous light and structural edits as mixed", () => {
    const diff = classifyFormEdit(
      createForm(),
      createForm({
        title: "Updated signal intake",
        fields: [{ id: "impact", type: "longText", label: "Impact", required: true, sensitive: false }],
      }),
    );

    expect(diff.classification).toBe("mixed");
    expect(diff.lightFields).toEqual(["title"]);
    expect(diff.structuralFields).toEqual(["fields"]);
  });

  it("normalizes invalid or missing form versions to v1", () => {
    expect(resolveFormVersion({})).toBe(1);
    expect(resolveFormVersion({ formVersion: "2" })).toBe(2);
    expect(resolveFormVersion({ formVersion: 2.8 })).toBe(2);
    expect(resolveFormVersion({ formVersion: 0 })).toBe(1);
    expect(resolveFormVersion({ formVersion: "not-a-number" })).toBe(1);
  });
});
