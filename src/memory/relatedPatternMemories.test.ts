import { describe, expect, it } from "vitest";
import type { SignalRecord } from "../features/admin/hooks/useSignalInboxData";
import type { FormSchema, Submission } from "../types";
import type { SignalPatternMemory } from "./types";
import { getRelatedPatternMemoryMatches, getSafeSignalProfile } from "./relatedPatternMemories";

function createRecord(overrides: Partial<Submission> = {}, formOverrides: Partial<FormSchema> = {}): SignalRecord {
  const form: FormSchema = {
    id: "feedback-form-1",
    projectId: "project-1",
    title: "Product Feedback",
    description: "Feedback channel",
    fields: [
      {
        id: "details",
        type: "longText",
        label: "Issue description",
        required: true,
        sensitive: false,
      },
    ],
    sections: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...formOverrides,
  };
  const submission: Submission = {
    id: "signal-1",
    formId: form.id,
    answers: { details: "raw answer secret wallet connection failed" },
    attachments: [],
    publicPayload: {
      answers: { details: "public raw answer secret" },
    },
    encryptedPayload: "encrypted-payload-secret",
    respondentMeta: {
      chain: "sui",
      isAnonymous: true,
      sessionId: "session-secret",
      submittedAt: "2026-01-01T00:00:00.000Z",
    },
    metadata: {
      token: "metadata-secret",
    },
    responderSignature: "signature-secret",
    responderSignedBytes: "signed-bytes-secret",
    category: "bug",
    priority: "high",
    triageStatus: "investigating",
    status: "unread",
    tags: ["wallet", "mobile-ux"],
    aiSummary: "Users cannot understand wallet connection on mobile.",
    subjectPreview: "Wallet connection confusion",
    notes: "Review note: connection copy is unclear. session=note-secret",
    isEncrypted: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    ...overrides,
  };
  return {
    form: { ...form, submissionCount: 1 },
    submission,
    category: "Bug",
    searchText: "wallet connection mobile",
  };
}

function createMemory(overrides: Partial<SignalPatternMemory> = {}): SignalPatternMemory {
  return {
    schemaVersion: "deepsignal.signal_pattern_memory.v1",
    memoryId: "memory-1",
    type: "user_feedback_pattern",
    title: "Wallet connection pattern",
    summary: "Users report wallet connection confusion.",
    signalKinds: ["user_signal"],
    sourceSignalIds: [],
    fingerprints: [],
    tags: [],
    affectedRoutes: [],
    affectedBuilds: [],
    platforms: [],
    frequency: {
      count: 2,
      window: "all_time",
      trend: "stable",
    },
    firstSeen: "2026-01-01T00:00:00.000Z",
    lastSeen: "2026-01-01T00:00:00.000Z",
    status: "watching",
    confidence: "medium",
    evidenceSummary: ["Safe summary."],
    recommendedAction: "Review safely.",
    recommendedCodexPrompt: "Investigate wallet connection copy.",
    failedFixes: [],
    confirmedFixes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:05:00.000Z",
    ...overrides,
  };
}

describe("related pattern memories", () => {
  it("extracts only a safe signal profile", () => {
    const profile = getSafeSignalProfile(createRecord());
    const serialized = JSON.stringify(profile);

    expect(profile.submissionId).toBe("signal-1");
    expect(profile.formId).toBe("feedback-form-1");
    expect(profile.projectId).toBe("project-1");
    expect(profile.tags).toEqual(["wallet", "mobile-ux"]);
    expect(serialized).toContain("connection copy is unclear");
    expect(serialized).not.toContain("raw answer secret");
    expect(serialized).not.toContain("public raw answer secret");
    expect(serialized).not.toContain("encrypted-payload-secret");
    expect(serialized).not.toContain("session-secret");
    expect(serialized).not.toContain("signature-secret");
    expect(serialized).not.toContain("metadata-secret");
    expect(serialized).not.toContain("note-secret");
  });

  it("matches user signals by tags", () => {
    const matches = getRelatedPatternMemoryMatches(createRecord(), [
      createMemory({ memoryId: "tag-memory", tags: ["mobile-ux"] }),
    ]);

    expect(matches.map((match) => match.memory.memoryId)).toEqual(["tag-memory"]);
    expect(matches[0].reasons).toContain("shared_tags");
  });

  it("matches user signals by category and memory type", () => {
    const matches = getRelatedPatternMemoryMatches(createRecord(), [
      createMemory({ memoryId: "category-memory", type: "ux_friction_pattern", title: "Bug friction" }),
    ]);

    expect(matches.map((match) => match.memory.memoryId)).toEqual(["category-memory"]);
    expect(matches[0].reasons).toContain("same_category");
  });

  it("matches user signals by safe aiSummary keywords", () => {
    const matches = getRelatedPatternMemoryMatches(createRecord(), [
      createMemory({
        memoryId: "summary-memory",
        title: "Mobile wallet connection confusion",
        summary: "Connection language is unclear for mobile users.",
      }),
    ]);

    expect(matches.map((match) => match.memory.memoryId)).toEqual(["summary-memory"]);
    expect(matches[0].reasons).toContain("similar_summary");
  });

  it("matches user signals by project and form context", () => {
    const matches = getRelatedPatternMemoryMatches(
      createRecord(),
      [
        createMemory({
          memoryId: "context-memory",
          tags: ["project-1", "feedback-form-1"],
          summary: "Feedback form pattern for project-1.",
        }),
      ],
      { projectId: "project-1" },
    );

    expect(matches.map((match) => match.memory.memoryId)).toEqual(["context-memory"]);
    expect(matches[0].reasons).toContain("same_project");
    expect(matches[0].reasons).toContain("same_form");
  });

  it("de-prioritizes stale memories below active memories with the same safe match", () => {
    const matches = getRelatedPatternMemoryMatches(createRecord(), [
      createMemory({
        memoryId: "active-memory",
        title: "Old weak pattern",
        summary: "Historical issue.",
        evidenceSummary: ["Historical safe summary."],
        tags: ["wallet"],
      }),
      createMemory({
        memoryId: "stale-memory",
        status: "stale",
        title: "Old weak pattern",
        summary: "Historical issue.",
        evidenceSummary: ["Historical safe summary."],
        tags: ["wallet"],
      }),
    ]);

    expect(matches.map((match) => match.memory.memoryId)).toEqual(["active-memory", "stale-memory"]);
    expect(matches[0].score).toBeGreaterThan(matches[1].score);
  });
});
