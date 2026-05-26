import { describe, expect, it } from "vitest";
import type { FormSchema, Submission } from "../../../types";
import type { SignalRecord } from "../hooks/useSignalInboxData";
import type { ResolvedAnalysisProfile } from "./analysisProfiles";
import { buildSignalCardIntelligence, buildWorkspaceAnalysisExperience } from "./signalIntelligence";

function createForm(overrides: Partial<FormSchema> = {}): FormSchema {
  return {
    id: "form-1",
    title: "Tokyo Earthquake Signal Demo",
    description: "Disaster monitoring form",
    fields: [],
    sections: [],
    purpose: "bug",
    analysisProfileId: "incident_report",
    signalType: "disaster",
    analystType: "risk",
    analysisType: "urgency",
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
    ...overrides,
  };
}

function createSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "submission-1",
    formId: "form-1",
    answers: {
      signal: "Two neighbors are trapped upstairs and medical support is needed now.",
    },
    attachments: [],
    location: {
      latitude: 35.71,
      longitude: 139.81,
      accuracy: 30,
      capturedAt: "2026-05-26T00:10:00.000Z",
      source: "browser_geolocation",
    },
    respondentMeta: {
      chain: "sui",
      submittedAt: "2026-05-26T00:10:00.000Z",
      isAnonymous: true,
      sessionId: "anon-1",
    },
    aiSummary: "High-urgency Sumida signal with trapped residents and medical demand.",
    severity: "high",
    emotion: "urgent",
    keywords: ["earthquake", "medical", "sumida"],
    clusterId: "Tokyo / Sumida medical cluster",
    status: "unread",
    priority: "high",
    triageStatus: "new",
    tags: ["earthquake", "medical"],
    notes: "",
    signalValue: 5,
    isEncrypted: false,
    subjectPreview: "Trapped residents in Sumida",
    ratingValue: 5,
    createdAt: "2026-05-26T00:10:00.000Z",
    updatedAt: "2026-05-26T00:10:00.000Z",
    ...overrides,
  };
}

function createRecord(overrides: { form?: Partial<FormSchema>; submission?: Partial<Submission> } = {}): SignalRecord {
  return {
    form: { ...createForm(overrides.form), submissionCount: 1 },
    submission: createSubmission(overrides.submission),
    category: "General",
    searchText: "earthquake medical sumida",
  };
}

const profile: ResolvedAnalysisProfile = {
  id: "incident_report",
  signalType: "disaster",
  analystType: "risk",
  analysisType: "urgency",
  label: "Incident Report",
  shortLabel: "Incident",
  description: "Tracks urgency, spread, and anomaly pressure.",
  keyFinding: "Incident pressure is defined by urgency, spread, and anomaly movement.",
  whyItMatters: "When high-severity reports and live spikes align, the inbox becomes an operational escalation surface.",
  highlightedAction: "Route the dominant high-severity incident cluster to the incident owner.",
  evidenceCount: 3,
  metrics: [],
  insightCards: [],
  recommendedActions: [
    { id: "page-owners", title: "Escalate the highest-severity cluster", detail: "Escalate now.", urgency: "now" },
  ],
  emphasis: {
    tone: "crimson",
    label: "Incident watch",
    headline: "Escalate fast, then measure spread",
    body: "This profile is tuned for urgency and blast radius.",
  },
};

describe("signalIntelligence", () => {
  it("builds intelligence-first signal card metadata", () => {
    const intelligence = buildSignalCardIntelligence(createRecord());

    expect(intelligence.urgencyScore).toBeGreaterThanOrEqual(75);
    expect(intelligence.signalTypeLabel).toBe("Disaster");
    expect(intelligence.analystTypeLabel).toBe("Risk");
    expect(intelligence.recommendedAction).toMatch(/location cluster/i);
    expect(intelligence.locationLabel).toContain("35.710");
  });

  it("builds fallback workspace analysis summary and cards", () => {
    const records = [
      createRecord(),
      createRecord({
        submission: {
          id: "submission-2",
          status: "read",
          priority: "medium",
          triageStatus: "investigating",
          emotion: "concerned",
          createdAt: "2026-05-25T23:40:00.000Z",
          updatedAt: "2026-05-25T23:50:00.000Z",
        },
      }),
    ];

    const experience = buildWorkspaceAnalysisExperience({
      records,
      profile,
      encryptedWaitingCount: 0,
      anomalyCount: 2,
      topClusterLabel: "Tokyo / Sumida medical cluster",
    });

    expect(experience.summaryEntries.map((entry) => entry.label)).toEqual([
      "What happened",
      "Why it matters",
      "Urgency level",
      "Key risk",
      "Recommended next action",
      "Confidence / data quality",
    ]);
    expect(experience.overviewCards.some((card) => card.id === "location-cluster")).toBe(true);
    expect(experience.executiveLines[0]).toMatch(/Incident Report/);
  });
});
