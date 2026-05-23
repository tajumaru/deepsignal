import { describe, expect, it } from "vitest";
import { analyzeSignalDraft } from "./signalIntelligence";
import type { FormBuilderValues } from "./types";

function createValues(patch: Partial<FormBuilderValues> = {}): FormBuilderValues {
  return {
    selectedTemplateKey: "blank",
    title: "Product feedback",
    description: "Anonymous feedback about onboarding",
    headerImage: {
      url: "",
      alt: "",
      position: "center",
      source: "url",
      fileName: "",
    },
    headerLogo: {
      url: "",
      alt: "",
      source: "url",
      fileName: "",
    },
    fields: [
      {
        id: "field-1",
        type: "shortText",
        label: "What should we improve?",
        required: false,
        sensitive: false,
        visibility: "public",
        adminOnly: false,
      },
    ],
    sections: [],
    purpose: "custom",
    visibility: "public",
    identityPolicy: "anonymous_allowed",
    locationRequirement: "optional",
    encryptSubmissions: false,
    responseDeadlinePreset: "none",
    responseDeadlineCustomAt: "",
    currentStep: "fields",
    mobilePane: "editor",
    fieldTypePickerOpen: false,
    activeFieldId: "",
    draggedFieldId: null,
    dragOverFieldId: null,
    dragOverPlacement: null,
    selectedProjectId: "",
    projectState: "",
    ...patch,
  };
}

describe("analyzeSignalDraft", () => {
  it("flags response fatigue when there are many required blocks", () => {
    const analysis = analyzeSignalDraft(
      createValues({
        fields: Array.from({ length: 8 }, (_, index) => ({
          id: `field-${index}`,
          type: "shortText",
          label: `Question ${index + 1}`,
          required: true,
          sensitive: false,
          visibility: "public",
          adminOnly: false,
        })),
      }),
    );

    expect(analysis.warnings.map((item) => item.id)).toEqual(
      expect.arrayContaining(["responseFatigueManyBlocks", "responseFatigueRequiredRatio"]),
    );
  });

  it("suggests Seal when sensitive language appears in an open intake", () => {
    const analysis = analyzeSignalDraft(
      createValues({
        description: "Collect private complaint feedback with email context",
        encryptSubmissions: false,
      }),
    );

    expect(analysis.suggestions.map((item) => item.id)).toContain("privacySealSuggestion");
  });

  it("detects stronger readiness when narrative and privacy posture are present", () => {
    const analysis = analyzeSignalDraft(
      createValues({
        encryptSubmissions: true,
        fields: [
          {
            id: "field-1",
            type: "longText",
            label: "Why did this change matter?",
            required: false,
            sensitive: false,
            visibility: "public",
            adminOnly: false,
          },
        ],
      }),
    );

    expect(analysis.strengths.map((item) => item.id)).toEqual(
      expect.arrayContaining(["publishReadinessStrong", "privacyPostureStrong", "reflectionDepthStrong"]),
    );
    expect(analysis.score).toBeGreaterThanOrEqual(80);
  });
});
