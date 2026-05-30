import { describe, expect, it } from "vitest";
import type { FormSchema, Submission } from "../../../types";
import type { SignalRecord } from "../hooks/useSignalInboxData";
import type { AnalysisProfileContext } from "./analysisProfiles";
import { resolveAnalysisProfile } from "./analysisProfiles";

function createForm(overrides: Partial<FormSchema> = {}): FormSchema {
  return {
    id: "form-1",
    title: "Signal intake",
    description: "Operational signal form",
    fields: [],
    sections: [],
    purpose: "custom",
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
    ...overrides,
  };
}

function createSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "submission-1",
    formId: "form-1",
    answers: { signal: "Urgent help is needed near the station." },
    attachments: [],
    aiSummary: "Urgent location signal.",
    severity: "high",
    emotion: "urgent",
    keywords: ["urgent", "station"],
    clusterId: "Station cluster",
    status: "unread",
    priority: "high",
    triageStatus: "new",
    tags: ["urgent"],
    notes: "",
    isEncrypted: false,
    subjectPreview: "Urgent station help",
    createdAt: "2026-05-26T00:10:00.000Z",
    updatedAt: "2026-05-26T00:10:00.000Z",
    ...overrides,
  };
}

function createRecord(args: { form?: Partial<FormSchema>; submission?: Partial<Submission> } = {}): SignalRecord {
  return {
    form: { ...createForm(args.form), submissionCount: 1 },
    submission: createSubmission(args.submission),
    category: "General",
    searchText: "urgent station",
  };
}

function createContext(records: SignalRecord[]): AnalysisProfileContext {
  return {
    records,
    totalSignals: records.length,
    unreadSignals: records.filter((record) => record.submission.status === "unread").length,
    needsReviewSignals: records.length,
    encryptedSignals: records.filter((record) => record.submission.isEncrypted).length,
    unresolvedSignals: records.filter((record) => record.submission.triageStatus !== "closed").length,
    archivedSignals: 0,
    anomalyCount: 1,
    activityStatusTone: "spike",
    signalSummaryItems: [],
    encryptedWaitingCount: 0,
    clusters: [
      {
        label: "Station cluster",
        summary: "Urgent help request",
        keywords: ["urgent", "station"],
        signalCount: records.length,
        confidence: 86,
        severity: "high",
        trend: "increasing",
      },
    ],
    silenceCandidates: [],
    relatedPatterns: [],
    currentVelocity: {
      count: 1,
      medianLagHours: 2,
      withinDayPercent: 100,
      bucketCounts: [{ label: "0-6h", count: 1 }],
    },
  };
}

describe("analysisProfiles", () => {
  it("adds disaster-specific evidence to insight cards", () => {
    const profile = resolveAnalysisProfile(
      createContext([
        createRecord({
          form: {
            analysisProfileId: "incident_report",
            signalType: "disaster",
            analystType: "risk",
            analysisType: "urgency",
          },
        }),
      ]),
    );

    const urgentCard = profile.insightCards.find((card) => card.id === "urgent-front");

    expect(profile.signalType).toBe("disaster");
    expect(urgentCard?.eyebrow).toBe("Help demand");
    expect(urgentCard?.evidence?.map((chip) => chip.label)).toContain("Urgent");
  });

  it("specializes product voice cards around action routing", () => {
    const profile = resolveAnalysisProfile(
      createContext([
        createRecord({
          form: {
            analysisProfileId: "customer_feedback",
            signalType: "product_voice",
            analystType: "product",
            analysisType: "action",
          },
          submission: {
            aiSummary: "Users cannot find mobile filters.",
            subjectPreview: "Mobile filters are hard to find",
            keywords: ["mobile", "filters", "friction"],
          },
        }),
      ]),
    );

    const topicCard = profile.insightCards.find((card) => card.id === "topic-cluster");

    expect(profile.signalType).toBe("product_voice");
    expect(topicCard?.eyebrow).toBe("Action cluster");
    expect(topicCard?.evidence?.some((chip) => chip.label === "Action cluster")).toBe(true);
  });

  it("specializes feedback cards around sentiment and repeated pain", () => {
    const profile = resolveAnalysisProfile(
      createContext([
        createRecord({
          form: {
            analysisProfileId: "customer_feedback",
            signalType: "feedback",
            analystType: "product",
            analysisType: "sentiment",
          },
          submission: {
            aiSummary: "Mobile filters are frustrating and hard to find.",
            subjectPreview: "Filters are frustrating",
            keywords: ["mobile", "filters", "friction"],
            emotion: "frustrated",
          },
        }),
      ]),
    );

    const sentimentCard = profile.insightCards.find((card) => card.id === "sentiment-readout");
    const topicCard = profile.insightCards.find((card) => card.id === "topic-cluster");

    expect(profile.signalType).toBe("feedback");
    expect(sentimentCard?.eyebrow).toBe("Sentiment balance");
    expect(topicCard?.eyebrow).toBe("Repeated pain");
    expect(topicCard?.evidence?.some((chip) => chip.label === "Repeated pain")).toBe(true);
  });

  it("specializes internal report cards around contradictions and ownership", () => {
    const profile = resolveAnalysisProfile(
      createContext([
        createRecord({
          form: {
            analysisProfileId: "incident_report",
            signalType: "internal_report",
            analystType: "operations",
            analysisType: "risk",
          },
          submission: {
            aiSummary: "Approval contradicts the visible access state and the team is concerned.",
            subjectPreview: "Approval mismatch",
            keywords: ["approval", "contradiction", "access"],
            emotion: "concerned",
          },
        }),
      ]),
    );

    const contradictionCard = profile.insightCards.find((card) => card.id === "spread-front");

    expect(profile.signalType).toBe("internal_report");
    expect(contradictionCard?.eyebrow).toBe("Contradiction");
    expect(contradictionCard?.evidence?.some((chip) => chip.label === "Contradiction")).toBe(true);
  });
});
