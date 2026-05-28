import { describe, expect, it } from "vitest";
import type { FormSchema } from "../types";
import { normalizeForm as normalizeStandaloneForm } from "./formSchema";
import { computeSchemaHash } from "./formVersioning";
import { normalizeForm as normalizeStorageForm } from "./storage";

function createLegacyForm(overrides: Partial<FormSchema> = {}): FormSchema {
  return {
    id: "form-legacy",
    title: "Legacy signal",
    description: "Older cached form",
    fields: [
      {
        id: "impact",
        type: "shortText",
        label: "Impact",
        required: true,
        sensitive: false,
      },
    ],
    sections: [],
    createdAt: "2026-05-28T00:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeForm version metadata", () => {
  it.each([
    ["standalone", normalizeStandaloneForm],
    ["storage", normalizeStorageForm],
  ])("%s normalizer backfills version metadata for legacy forms", (_name, normalize) => {
    const normalized = normalize(createLegacyForm());

    expect(normalized).toMatchObject({
      id: "form-legacy",
      baseFormId: "form-legacy",
      formVersion: 1,
    });
    expect(normalized.schemaHash).toBe(computeSchemaHash(normalized));
  });

  it.each([
    ["standalone", normalizeStandaloneForm],
    ["storage", normalizeStorageForm],
  ])("%s normalizer preserves existing version metadata", (_name, normalize) => {
    const normalized = normalize(
      createLegacyForm({
        baseFormId: "base-form",
        formVersion: 3,
        schemaHash: "schema:v1:existing",
      }),
    );

    expect(normalized).toMatchObject({
      baseFormId: "base-form",
      formVersion: 3,
      schemaHash: "schema:v1:existing",
    });
  });

  it.each([
    ["standalone", normalizeStandaloneForm],
    ["storage", normalizeStorageForm],
  ])("%s normalizer recomputes schemaHash from structural shape only", (_name, normalize) => {
    const base = normalize(createLegacyForm({ title: "Original title" }));
    const lightEdit = normalize(createLegacyForm({ title: "Updated title" }));
    const structuralEdit = normalize(
      createLegacyForm({
        fields: [
          {
            id: "impact",
            type: "longText",
            label: "Impact",
            required: true,
            sensitive: false,
          },
        ],
      }),
    );

    expect(lightEdit.schemaHash).toBe(base.schemaHash);
    expect(structuralEdit.schemaHash).not.toBe(base.schemaHash);
  });
});
