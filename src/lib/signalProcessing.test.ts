import { describe, expect, it } from "vitest";
import type { FormSchema, Submission } from "../types";
import {
  buildSubmissionInsightPayload,
  getInsightAnswers,
  isAggregateInsightField,
  normalizeFieldProcessingPolicy,
} from "./signalProcessing";

const form: FormSchema = {
  id: "form-hybrid",
  title: "Hybrid feedback",
  description: "",
  purpose: "feature",
  fields: [
    {
      id: "rating",
      type: "rating",
      label: "Rating",
      required: true,
      sensitive: false,
    },
    {
      id: "comment",
      type: "longText",
      label: "Comment",
      required: false,
      sensitive: false,
    },
    {
      id: "email",
      type: "shortText",
      label: "Email",
      required: false,
      sensitive: true,
    },
  ],
  sections: [],
  processingMode: "hybrid",
  createdAt: "2026-05-31T00:00:00.000Z",
  updatedAt: "2026-05-31T00:00:00.000Z",
};

function createSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "submission-1",
    formId: "form-hybrid",
    answers: {
      rating: 5,
      comment: "Please review this text",
      email: "person@example.com",
    },
    attachments: [],
    category: "feature",
    status: "unread",
    priority: "medium",
    triageStatus: "new",
    tags: [],
    notes: "",
    isEncrypted: false,
    createdAt: "2026-05-31T01:00:00.000Z",
    updatedAt: "2026-05-31T01:00:00.000Z",
    ...overrides,
  };
}

describe("signal processing insight payloads", () => {
  it("marks only non-sensitive aggregate fields as insight-ready", () => {
    expect(isAggregateInsightField(form.fields[0])).toBe(true);
    expect(isAggregateInsightField(form.fields[1])).toBe(false);
    expect(isAggregateInsightField(form.fields[2])).toBe(false);
  });

  it("lets explicit field policy steer hybrid insight eligibility without overriding sensitive fields", () => {
    expect(normalizeFieldProcessingPolicy("unknown")).toBe("auto");
    expect(isAggregateInsightField({ ...form.fields[1], processingPolicy: "aggregate" })).toBe(true);
    expect(isAggregateInsightField({ ...form.fields[0], processingPolicy: "review" })).toBe(false);
    expect(isAggregateInsightField({ ...form.fields[2], processingPolicy: "aggregate" })).toBe(false);
  });

  it("builds a hybrid payload that keeps free text and sensitive fields out of immediate insights", () => {
    const payload = buildSubmissionInsightPayload(form, createSubmission(), "2026-05-31T01:00:00.000Z");

    expect(payload).toEqual({
      answers: {
        rating: 5,
      },
      fieldIds: ["rating"],
      redactedFieldIds: ["comment", "email"],
      generatedAt: "2026-05-31T01:00:00.000Z",
    });
  });

  it("lets insight consumers prefer the redacted aggregate payload when present", () => {
    const submission = createSubmission({
      insightPayload: {
        answers: {
          rating: 4,
        },
        fieldIds: ["rating"],
        redactedFieldIds: ["comment"],
        generatedAt: "2026-05-31T01:00:00.000Z",
      },
    });

    expect(getInsightAnswers(submission)).toEqual({ rating: 4 });
  });
});
