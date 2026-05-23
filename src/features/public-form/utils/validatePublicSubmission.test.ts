import { describe, expect, it } from "vitest";
import { validateSubmissionLocation } from "./validatePublicSubmission";
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
