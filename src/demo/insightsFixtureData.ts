import { forcePurgeFormArtifacts } from "../storage/forcePurgeFormArtifacts";
import { localStorageAdapter } from "../storage/localStorageAdapter";
import { serializeReviewNotes } from "../lib/reviewCollaboration";
import type { FormSchema, Submission } from "../types";

export type InsightsFixtureMode = "stable" | "urgent_spike" | "silence" | "combined";

export const INSIGHTS_FIXTURE_FORM_ID = "fixture-insights-signal-observatory";
export const INSIGHTS_FIXTURE_PROJECT_ID = "fixture-insights-observatory";
const INSIGHTS_FIXTURE_META_KEY = "deepsignal.dev.insightsFixture.meta";

export interface InsightsFixtureMeta {
  mode: InsightsFixtureMode;
  seededAt: string;
  submissionCount: number;
  formId: string;
  projectId: string;
}

function readFixtureMeta() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(INSIGHTS_FIXTURE_META_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<InsightsFixtureMeta>;
    if (
      !parsed ||
      typeof parsed.mode !== "string" ||
      typeof parsed.seededAt !== "string" ||
      typeof parsed.submissionCount !== "number" ||
      typeof parsed.formId !== "string" ||
      typeof parsed.projectId !== "string"
    ) {
      return null;
    }
    return parsed as InsightsFixtureMeta;
  } catch {
    return null;
  }
}

function writeFixtureMeta(meta: InsightsFixtureMeta) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(INSIGHTS_FIXTURE_META_KEY, JSON.stringify(meta));
}

function clearFixtureMeta() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(INSIGHTS_FIXTURE_META_KEY);
}

function isoFromNow(args: { days?: number; hours?: number; minutes?: number }) {
  const date = new Date();
  if (args.days) {
    date.setDate(date.getDate() - args.days);
  }
  if (args.hours) {
    date.setHours(date.getHours() - args.hours);
  }
  if (args.minutes) {
    date.setMinutes(date.getMinutes() - args.minutes);
  }
  return date.toISOString();
}

function buildReviewerNotes(notes: string, reviewer: string, noteUpdatedAt: string) {
  return serializeReviewNotes(notes, {
    reviewer,
    noteUpdatedAt,
  });
}

export const insightsFixtureForm: FormSchema = {
  id: INSIGHTS_FIXTURE_FORM_ID,
  title: "Insights Signal Observatory",
  description:
    "Local-only fixture form for validating DeepSignal state observation UI across stable flow, urgent spike, and silence patterns.",
  fields: [
    {
      id: "signal",
      type: "longText",
      label: "Signal",
      required: true,
      sensitive: false,
      placeholder: "Describe the signal.",
    },
    {
      id: "district",
      type: "dropdown",
      label: "District",
      required: true,
      sensitive: false,
      options: ["Tokyo / Shibuya", "Tokyo / Shinjuku", "Tokyo / Setagaya"],
    },
    {
      id: "urgency",
      type: "rating",
      label: "Urgency",
      required: true,
      sensitive: false,
    },
  ],
  sections: [
    {
      id: "monitoring",
      title: "Observatory",
      description: "Signals for testing Insights state observation.",
    },
  ],
  purpose: "bug",
  visibility: "unlisted",
  identityPolicy: "anonymous_allowed",
  publicExplore: false,
  createdAt: isoFromNow({ days: 10 }),
  updatedAt: isoFromNow({ minutes: 1 }),
  creationMode: "admin",
  encryptSubmissions: false,
  projectId: INSIGHTS_FIXTURE_PROJECT_ID,
  projectName: "Insights Observatory",
  registrationMode: "walrus",
  blobId: "fixture-observatory-form-001",
  manifestBlobId: "fixture-observatory-manifest-001",
};

function buildBaseSubmission(args: {
  id: string;
  signal: string;
  district: "Tokyo / Shibuya" | "Tokyo / Shinjuku" | "Tokyo / Setagaya";
  urgency: number;
  category: Submission["category"];
  aiSummary: string;
  severity: Submission["severity"];
  emotion: string;
  keywords: string[];
  clusterId: string;
  status: Submission["status"];
  priority: Submission["priority"];
  triageStatus: Submission["triageStatus"];
  tags: string[];
  notes: string;
  signalValue: number;
  subjectPreview: string;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: args.id,
    formId: INSIGHTS_FIXTURE_FORM_ID,
    answers: {
      signal: args.signal,
      district: args.district,
      urgency: String(args.urgency),
    },
    attachments: [],
    respondentMeta: {
      chain: "sui" as const,
      submittedAt: args.createdAt,
      isAnonymous: true,
      sessionId: `${args.id}-session`,
    },
    category: args.category,
    aiSummary: args.aiSummary,
    severity: args.severity,
    emotion: args.emotion,
    keywords: args.keywords,
    clusterId: args.clusterId,
    status: args.status,
    priority: args.priority,
    triageStatus: args.triageStatus,
    tags: args.tags,
    notes: args.notes,
    contributorId: `${args.id}-contributor`,
    signalValue: args.signalValue,
    isEncrypted: false,
    subjectPreview: args.subjectPreview,
    ratingValue: args.urgency,
    createdAt: args.createdAt,
    updatedAt: args.updatedAt,
    blobId: `fixture-blob-${args.id}`,
  } satisfies Submission;
}

function buildStableSignals() {
  return Array.from({ length: 18 }, (_, index) => {
    const sequence = index + 1;
    const days = 12 - Math.floor(index / 2);
    const createdAt = isoFromNow({ days, hours: (index % 3) * 4 + 1 });
    const updatedAt =
      index % 5 === 0
        ? createdAt
        : isoFromNow({ days, hours: Math.max(0, (index % 3) * 4 - 1) });
    const triageStatus: Submission["triageStatus"] =
      index % 6 === 0 ? "investigating" : index % 4 === 0 ? "fixed" : "planned";
    const status: Submission["status"] = index % 7 === 0 ? "unread" : "read";
    const priority: Submission["priority"] = index % 4 === 0 ? "medium" : "low";
    const urgency = index % 5 === 0 ? 3 : 2;

    return buildBaseSubmission({
      id: `fixture-stable-${String(sequence).padStart(3, "0")}`,
      signal:
        index % 3 === 0
          ? "Routine district feedback reports that the public intake and reviewer handoff feel safe and calm."
          : index % 3 === 1
            ? "Responders continue to report safe handling and no unusual need for escalation in Shibuya."
            : "Safe answer patterns continue with no notable risk language and steady, low-friction review outcomes.",
      district: "Tokyo / Shibuya",
      urgency,
      category: "survey",
      aiSummary: "Stable, low-risk Shibuya feedback indicating smooth intake behavior.",
      severity: "low",
      emotion: index % 2 === 0 ? "calm" : "neutral",
      keywords: ["safe", "stable", "shibuya", index % 2 === 0 ? "normal" : "steady"],
      clusterId: "Tokyo / Shibuya",
      status,
      priority,
      triageStatus,
      tags: ["stable", "safe", index % 2 === 0 ? "normal-flow" : "baseline"],
      notes:
        status === "read"
          ? buildReviewerNotes(
              "Routine baseline capture for calm-state monitoring.",
              "ops@deepsignal",
              updatedAt,
            )
          : "",
      signalValue: urgency,
      subjectPreview:
        index % 2 === 0 ? "Stable signal from Shibuya" : "Nominal pulse in Shibuya",
      createdAt,
      updatedAt,
    });
  });
}

function buildUrgentSpikeSignals() {
  return Array.from({ length: 20 }, (_, index) => {
    const sequence = index + 1;
    const hoursAgo = 34 - index;
    const createdAt = isoFromNow({ hours: Math.max(1, hoursAgo) });
    const isReviewed = index >= 8;
    const updatedAt = isReviewed
      ? isoFromNow({ hours: Math.max(0, hoursAgo - (index % 3 === 0 ? 1 : 2)) })
      : createdAt;
    const triageStatus: Submission["triageStatus"] = isReviewed
      ? index % 5 === 0
        ? "planned"
        : "investigating"
      : "new";
    const status: Submission["status"] = isReviewed ? "read" : "unread";

    return buildBaseSubmission({
      id: `fixture-spike-${String(sequence).padStart(3, "0")}`,
      signal:
        index % 4 === 0
          ? "Urgent need in Shinjuku: intake responders say they need immediate routing help and faster triage response."
          : index % 4 === 1
            ? "Need review now: several operators mention urgent backlog pressure building in Shinjuku."
            : index % 4 === 2
              ? "Urgent need persists: reviewers say current signal routing is under visible stress in Shinjuku."
              : "Need immediate follow-up: a visible Shinjuku spike is forming around urgent queue pressure.",
      district: "Tokyo / Shinjuku",
      urgency: index % 5 === 0 ? 4 : 5,
      category: "bug",
      aiSummary: "Urgent spike cluster forming in Shinjuku with repeated need language.",
      severity: "high",
      emotion: index % 3 === 0 ? "urgent" : "concerned",
      keywords: ["urgent", "need", "shinjuku", index % 2 === 0 ? "spike" : "queue"],
      clusterId: "Tokyo / Shinjuku",
      status,
      priority: "high",
      triageStatus,
      tags: ["urgent", "spike", index % 2 === 0 ? "need" : "high-priority"],
      notes:
        isReviewed
          ? buildReviewerNotes(
              "Reviewed rapidly to reinforce a visible current-window spike pattern.",
              "triage@deepsignal",
              updatedAt,
            )
          : "",
      signalValue: index % 5 === 0 ? 4 : 5,
      subjectPreview:
        index % 2 === 0 ? "Urgent signal spike in Shinjuku" : "Need rapid triage in Shinjuku",
      createdAt,
      updatedAt,
    });
  });
}

function buildSilenceSignals() {
  return Array.from({ length: 12 }, (_, index) => {
    const sequence = index + 1;
    const days = 14 - index;
    const createdAt = isoFromNow({ days, hours: (index % 4) * 3 + 2 });
    const updatedAt =
      index % 3 === 0
        ? createdAt
        : isoFromNow({ days: Math.max(4, days - 1), hours: (index % 4) * 2 + 1 });
    const status: Submission["status"] = index % 4 === 0 ? "read" : "unread";
    const triageStatus: Submission["triageStatus"] = index % 5 === 0 ? "new" : "investigating";
    const urgency = index % 3 === 0 ? 2 : 3;

    return buildBaseSubmission({
      id: `fixture-silence-${String(sequence).padStart(3, "0")}`,
      signal:
        index % 3 === 0
          ? "Setagaya cluster previously asked for safer follow-up but recent responses have almost stopped."
          : index % 3 === 1
            ? "Follow-up expectation stayed high in Setagaya, but actual new signal traffic has gone quiet."
            : "Quiet zone persists in Setagaya. Open questions remain, but new district answers are sparse.",
      district: "Tokyo / Setagaya",
      urgency,
      category: "feature",
      aiSummary: "Setagaya remains a monitored quiet zone with unresolved questions.",
      severity: "medium",
      emotion: index % 2 === 0 ? "neutral" : "concerned",
      keywords: ["setagaya", "quiet", "follow-up", index % 2 === 0 ? "monitor" : "low activity"],
      clusterId: "Tokyo / Setagaya",
      status,
      priority: "medium",
      triageStatus,
      tags: ["silence", index % 2 === 0 ? "quiet-zone" : "low-activity", "follow-up"],
      notes:
        status === "read"
          ? buildReviewerNotes(
              "Previous follow-up window remained slower than expected.",
              "review@deepsignal",
              updatedAt,
            )
          : "",
      signalValue: urgency,
      subjectPreview:
        index % 2 === 0 ? "Quiet zone in Setagaya" : "Low activity after follow-up",
      createdAt,
      updatedAt,
    });
  });
}

export function buildInsightsFixtureSubmissions(mode: InsightsFixtureMode) {
  switch (mode) {
    case "stable":
      return buildStableSignals();
    case "urgent_spike":
      return buildUrgentSpikeSignals();
    case "silence":
      return buildSilenceSignals();
    case "combined":
    default:
      return [...buildStableSignals(), ...buildUrgentSpikeSignals(), ...buildSilenceSignals()];
  }
}

export async function clearInsightsFixtureWorkspace() {
  forcePurgeFormArtifacts({
    formIds: [INSIGHTS_FIXTURE_FORM_ID],
    manifestBlobIds: [insightsFixtureForm.manifestBlobId ?? ""].filter(Boolean),
    blobIds: [insightsFixtureForm.blobId ?? ""].filter(Boolean),
  });
  clearFixtureMeta();
}

export async function seedInsightsFixtureWorkspace(mode: InsightsFixtureMode) {
  await clearInsightsFixtureWorkspace();
  await localStorageAdapter.saveForm({
    ...insightsFixtureForm,
    createdAt: isoFromNow({ days: 10 }),
    updatedAt: isoFromNow({ minutes: 1 }),
  });
  const submissions = buildInsightsFixtureSubmissions(mode);
  await Promise.all(submissions.map((submission) => localStorageAdapter.saveSubmission(submission)));
  const meta = {
    formId: INSIGHTS_FIXTURE_FORM_ID,
    projectId: INSIGHTS_FIXTURE_PROJECT_ID,
    mode,
    submissionCount: submissions.length,
    seededAt: new Date().toISOString(),
  };
  writeFixtureMeta(meta);
  return meta;
}

export function getInsightsFixtureMeta() {
  return readFixtureMeta();
}
