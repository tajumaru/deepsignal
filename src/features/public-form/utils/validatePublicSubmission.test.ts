import { describe, expect, it } from "vitest";
import { validatePublicSubmission, validateSubmissionLocation } from "./validatePublicSubmission";
import type { FormSchema, SubmissionLocation } from "../../../types";

const baseForm: FormSchema = {
  id: "form-1",
  title: "Location form",
  description: "",
  fields: [],
  createdAt: new Date(0).toISOString(),
};

const location: SubmissionLocation = {
  latitude: 35.6762,
  longitude: 139.6503,
  accuracy: 12,
  capturedAt: new Date(0).toISOString(),
  source: "browser_geolocation",
};

describe("validateSubmissionLocation", () => {
  it("allows submission without location when optional", () => {
    expect(
      validateSubmissionLocation(
        {
          ...baseForm,
          locationRequirement: "optional",
        },
        undefined,
        "locationRequiredFriendly",
      ),
    ).toBe("");
  });

  it("requires location when the form marks it required", () => {
    expect(
      validateSubmissionLocation(
        {
          ...baseForm,
          locationRequirement: "required",
        },
        undefined,
        "locationRequiredFriendly",
      ),
    ).toBe("locationRequiredFriendly");
    expect(
      validateSubmissionLocation(
        {
          ...baseForm,
          locationRequirement: "required",
        },
        location,
        "locationRequiredFriendly",
      ),
    ).toBe("");
  });
});

describe("validatePublicSubmission", () => {
  it("requires a recorded voice answer when the field is required", () => {
    const form: FormSchema = {
      ...baseForm,
      fields: [
        {
          id: "voice-1",
          type: "voice",
          label: "Share a voice update",
          required: true,
          sensitive: false,
        },
      ],
    };

    expect(
      validatePublicSubmission({
        form,
        answers: {},
        visibleFieldIds: new Set(["voice-1"]),
        attachmentFields: new Set(),
        requiredFieldError: "required",
      }),
    ).toEqual({ "voice-1": "required" });

    expect(
      validatePublicSubmission({
        form,
        answers: {
          "voice-1": {
            kind: "voice",
            audioUrl: "blob:preview",
            duration: 7,
            mimeType: "audio/webm",
          },
        },
        visibleFieldIds: new Set(["voice-1"]),
        attachmentFields: new Set(),
        requiredFieldError: "required",
      }),
    ).toEqual({});
  });
});
