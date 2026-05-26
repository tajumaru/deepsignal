import { forcePurgeFormArtifacts } from "../storage/forcePurgeFormArtifacts";
import { localStorageAdapter } from "../storage/localStorageAdapter";
import { serializeReviewNotes } from "../lib/reviewCollaboration";
import type { FormSchema, Submission, SubmissionLocation } from "../types";

export type InsightsFixtureMode =
  | "tokyo_earthquake"
  | "internal_risk"
  | "product_feedback"
  | "combined";

export const INSIGHTS_FIXTURE_PROJECT_ID = "fixture-insights-observatory";
export const INSIGHTS_FIXTURE_ENTRY_FORM_ID = "fixture-earthquake-tokyo";
export const INSIGHTS_FIXTURE_FORM_IDS = [
  "fixture-earthquake-tokyo",
  "fixture-internal-risk",
  "fixture-product-feedback",
] as const;
const INSIGHTS_FIXTURE_META_KEY = "deepsignal.dev.insightsFixture.meta";

export interface InsightsFixtureMeta {
  mode: InsightsFixtureMode;
  seededAt: string;
  submissionCount: number;
  formIds: string[];
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
      !Array.isArray(parsed.formIds) ||
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

function buildLocation(latitude: number, longitude: number): SubmissionLocation {
  return {
    latitude,
    longitude,
    accuracy: 35,
    capturedAt: isoFromNow({ hours: 1 }),
    source: "browser_geolocation",
  };
}

const earthquakeForm: FormSchema = {
  id: INSIGHTS_FIXTURE_FORM_IDS[0],
  title: "Tokyo Earthquake Signal Demo",
  description: "Disaster-focused signal stream for showing urgent help demand, clustered locations, conflicting safety states, and missing response coverage.",
  fields: [
    { id: "signal", type: "longText", label: "What happened?", required: true, sensitive: false },
    { id: "district", type: "dropdown", label: "District", required: true, sensitive: false, options: ["Tokyo / Sumida", "Tokyo / Koto", "Tokyo / Chiyoda"] },
    { id: "safety_status", type: "dropdown", label: "Safety status", required: true, sensitive: false, options: ["Safe", "Injured", "Trapped", "Unknown"] },
    { id: "urgent_need", type: "dropdown", label: "Urgent help needed", required: true, sensitive: false, options: ["Medical", "Water", "Shelter", "None"] },
  ],
  sections: [{ id: "quake", title: "Earthquake", description: "Live disaster intake for operator triage." }],
  purpose: "bug",
  analysisProfileId: "incident_report",
  signalType: "disaster",
  analystType: "risk",
  analysisType: "urgency",
  visibility: "unlisted",
  identityPolicy: "anonymous_allowed",
  createdAt: isoFromNow({ days: 4 }),
  updatedAt: isoFromNow({ minutes: 1 }),
  creationMode: "admin",
  encryptSubmissions: false,
  projectId: INSIGHTS_FIXTURE_PROJECT_ID,
  projectName: "Analysis Demo Workspace",
  registrationMode: "walrus",
  blobId: "fixture-earthquake-form",
  manifestBlobId: "fixture-earthquake-manifest",
};

const internalRiskForm: FormSchema = {
  id: INSIGHTS_FIXTURE_FORM_IDS[1],
  title: "Internal Risk Demo",
  description: "Internal report stream for surfacing emotional tone, escalation risk, affected teams, and contradictory leadership signals.",
  fields: [
    { id: "signal", type: "longText", label: "Internal report", required: true, sensitive: false },
    { id: "team", type: "dropdown", label: "Affected team", required: true, sensitive: false, options: ["Trust & Safety", "Operations", "Growth"] },
    { id: "risk_theme", type: "dropdown", label: "Risk theme", required: true, sensitive: false, options: ["Retaliation", "Burnout", "Access misuse", "Compliance"] },
    { id: "escalation", type: "dropdown", label: "Escalation risk", required: true, sensitive: false, options: ["Low", "Medium", "High"] },
  ],
  sections: [{ id: "internal", title: "Internal Risk", description: "Sensitive internal operational reporting." }],
  purpose: "custom",
  analysisProfileId: "incident_report",
  signalType: "internal_report",
  analystType: "operations",
  analysisType: "risk",
  visibility: "unlisted",
  identityPolicy: "anonymous_allowed",
  createdAt: isoFromNow({ days: 3 }),
  updatedAt: isoFromNow({ minutes: 1 }),
  creationMode: "admin",
  encryptSubmissions: false,
  projectId: INSIGHTS_FIXTURE_PROJECT_ID,
  projectName: "Analysis Demo Workspace",
  registrationMode: "walrus",
  blobId: "fixture-internal-form",
  manifestBlobId: "fixture-internal-manifest",
};

const productFeedbackForm: FormSchema = {
  id: INSIGHTS_FIXTURE_FORM_IDS[2],
  title: "Product Feedback Demo",
  description: "Feedback stream designed to highlight request clusters, friction, strong emotion, and product opportunities.",
  fields: [
    { id: "signal", type: "longText", label: "Feedback", required: true, sensitive: false },
    { id: "surface", type: "dropdown", label: "Surface", required: true, sensitive: false, options: ["Inbox", "Map", "Mobile", "Notifications"] },
    { id: "pain_point", type: "dropdown", label: "Pain point", required: true, sensitive: false, options: ["Search", "Filters", "Performance", "Collaboration"] },
    { id: "priority", type: "dropdown", label: "Priority", required: true, sensitive: false, options: ["Low", "Medium", "High"] },
  ],
  sections: [{ id: "feedback", title: "Product Feedback", description: "Product signal intake for repeated friction and opportunity clustering." }],
  purpose: "feature",
  analysisProfileId: "customer_feedback",
  signalType: "feedback",
  analystType: "product",
  analysisType: "sentiment",
  visibility: "unlisted",
  identityPolicy: "anonymous_allowed",
  createdAt: isoFromNow({ days: 2 }),
  updatedAt: isoFromNow({ minutes: 1 }),
  creationMode: "admin",
  encryptSubmissions: false,
  projectId: INSIGHTS_FIXTURE_PROJECT_ID,
  projectName: "Analysis Demo Workspace",
  registrationMode: "walrus",
  blobId: "fixture-feedback-form",
  manifestBlobId: "fixture-feedback-manifest",
};

const analysisFixtureForms = [earthquakeForm, internalRiskForm, productFeedbackForm];

function buildSubmission(args: {
  id: string;
  formId: string;
  answers: Record<string, unknown>;
  aiSummary: string;
  severity: Submission["severity"];
  emotion: string;
  keywords: string[];
  clusterId: string;
  status: Submission["status"];
  priority: Submission["priority"];
  triageStatus: Submission["triageStatus"];
  notes: string;
  signalValue: number;
  subjectPreview: string;
  createdAt: string;
  updatedAt: string;
  location?: SubmissionLocation;
}) {
  return {
    id: args.id,
    formId: args.formId,
    answers: args.answers,
    attachments: [],
    location: args.location,
    respondentMeta: {
      chain: "sui" as const,
      submittedAt: args.createdAt,
      isAnonymous: true,
      sessionId: `${args.id}-session`,
    },
    category: "general",
    aiSummary: args.aiSummary,
    severity: args.severity,
    emotion: args.emotion,
    keywords: args.keywords,
    clusterId: args.clusterId,
    status: args.status,
    priority: args.priority,
    triageStatus: args.triageStatus,
    tags: args.keywords,
    notes: args.notes,
    contributorId: `${args.id}-contributor`,
    signalValue: args.signalValue,
    isEncrypted: false,
    subjectPreview: args.subjectPreview,
    ratingValue: args.signalValue,
    createdAt: args.createdAt,
    updatedAt: args.updatedAt,
    blobId: `fixture-blob-${args.id}`,
  } satisfies Submission;
}

function buildTokyoEarthquakeSubmissions() {
  return [
    buildSubmission({
      id: "quake-001",
      formId: earthquakeForm.id,
      answers: {
        signal: "Apartment shaking stopped but two elderly neighbors are trapped upstairs and we need medical support immediately.",
        district: "Tokyo / Sumida",
        safety_status: "Trapped",
        urgent_need: "Medical",
      },
      aiSummary: "High-urgency Sumida signal with trapped residents and medical demand.",
      severity: "high",
      emotion: "urgent",
      keywords: ["earthquake", "sumida", "medical", "trapped"],
      clusterId: "Tokyo / Sumida medical cluster",
      status: "unread",
      priority: "high",
      triageStatus: "new",
      notes: "",
      signalValue: 5,
      subjectPreview: "Trapped residents in Sumida",
      createdAt: isoFromNow({ hours: 2 }),
      updatedAt: isoFromNow({ hours: 2 }),
      location: buildLocation(35.710, 139.810),
    }),
    buildSubmission({
      id: "quake-002",
      formId: earthquakeForm.id,
      answers: {
        signal: "We are marked safe but the block has no water and people are gathering outside with no instructions.",
        district: "Tokyo / Sumida",
        safety_status: "Safe",
        urgent_need: "Water",
      },
      aiSummary: "Conflicting safety report: self-marked safe but basic needs and coordination are failing.",
      severity: "high",
      emotion: "concerned",
      keywords: ["earthquake", "sumida", "water", "coordination"],
      clusterId: "Tokyo / Sumida medical cluster",
      status: "read",
      priority: "high",
      triageStatus: "investigating",
      notes: buildReviewerNotes("Conflicting safety status suggests the area is not actually stabilized.", "ops@deepsignal", isoFromNow({ hours: 1 })),
      signalValue: 4,
      subjectPreview: "Safe flag conflicts with unmet water need",
      createdAt: isoFromNow({ hours: 3 }),
      updatedAt: isoFromNow({ hours: 1 }),
      location: buildLocation(35.709, 139.812),
    }),
    buildSubmission({
      id: "quake-003",
      formId: earthquakeForm.id,
      answers: {
        signal: "Koto reports aftershock fear is high. No injury yet but families still have no shelter assignment.",
        district: "Tokyo / Koto",
        safety_status: "Unknown",
        urgent_need: "Shelter",
      },
      aiSummary: "Koto shelter demand is rising without a confirmed injury count.",
      severity: "medium",
      emotion: "fearful",
      keywords: ["earthquake", "koto", "shelter", "aftershock"],
      clusterId: "Tokyo / Koto shelter cluster",
      status: "unread",
      priority: "high",
      triageStatus: "new",
      notes: "",
      signalValue: 4,
      subjectPreview: "Koto shelter assignment missing",
      createdAt: isoFromNow({ hours: 4 }),
      updatedAt: isoFromNow({ hours: 4 }),
      location: buildLocation(35.675, 139.817),
    }),
    buildSubmission({
      id: "quake-004",
      formId: earthquakeForm.id,
      answers: {
        signal: "Chiyoda office responders say no visible injuries, but radio contact with one floor has stopped for thirty minutes.",
        district: "Tokyo / Chiyoda",
        safety_status: "Unknown",
        urgent_need: "None",
      },
      aiSummary: "Possible missing response pattern in Chiyoda despite low visible damage.",
      severity: "medium",
      emotion: "tense",
      keywords: ["earthquake", "chiyoda", "missing response", "radio"],
      clusterId: "Tokyo / Chiyoda radio gap",
      status: "read",
      priority: "medium",
      triageStatus: "investigating",
      notes: buildReviewerNotes("Silence after low-damage reports may still hide isolated impact.", "review@deepsignal", isoFromNow({ minutes: 50 })),
      signalValue: 3,
      subjectPreview: "Radio contact gap in Chiyoda",
      createdAt: isoFromNow({ hours: 6 }),
      updatedAt: isoFromNow({ minutes: 50 }),
      location: buildLocation(35.693, 139.753),
    }),
  ];
}

function buildInternalRiskSubmissions() {
  return [
    buildSubmission({
      id: "internal-001",
      formId: internalRiskForm.id,
      answers: {
        signal: "Three trust operators say access was expanded without review and they are afraid to raise it again after being dismissed last week.",
        team: "Trust & Safety",
        risk_theme: "Access misuse",
        escalation: "High",
      },
      aiSummary: "High-risk internal report linking access misuse with fear of retaliation.",
      severity: "high",
      emotion: "anxious",
      keywords: ["internal", "access misuse", "retaliation", "trust"],
      clusterId: "Trust access escalation",
      status: "unread",
      priority: "high",
      triageStatus: "new",
      notes: "",
      signalValue: 5,
      subjectPreview: "Trust operators fear access misuse escalation",
      createdAt: isoFromNow({ hours: 5 }),
      updatedAt: isoFromNow({ hours: 5 }),
    }),
    buildSubmission({
      id: "internal-002",
      formId: internalRiskForm.id,
      answers: {
        signal: "Operations managers say the same access change was approved, but no one can show the approval trail and the team is exhausted.",
        team: "Operations",
        risk_theme: "Compliance",
        escalation: "High",
      },
      aiSummary: "Contradictory leadership signal: change claimed as approved but audit trail is missing.",
      severity: "high",
      emotion: "frustrated",
      keywords: ["internal", "approval trail", "operations", "burnout"],
      clusterId: "Approval contradiction",
      status: "read",
      priority: "high",
      triageStatus: "investigating",
      notes: buildReviewerNotes("This contradiction should be escalated as one thread, not three separate HR notes.", "lead@deepsignal", isoFromNow({ hours: 2 })),
      signalValue: 4,
      subjectPreview: "Missing approval trail on risky access change",
      createdAt: isoFromNow({ hours: 7 }),
      updatedAt: isoFromNow({ hours: 2 }),
    }),
    buildSubmission({
      id: "internal-003",
      formId: internalRiskForm.id,
      answers: {
        signal: "Growth team says burnout risk is climbing because late-night review escalations now happen every day.",
        team: "Growth",
        risk_theme: "Burnout",
        escalation: "Medium",
      },
      aiSummary: "Burnout pattern visible in Growth due to daily after-hours escalations.",
      severity: "medium",
      emotion: "drained",
      keywords: ["internal", "burnout", "growth", "daily escalation"],
      clusterId: "Escalation fatigue",
      status: "unread",
      priority: "medium",
      triageStatus: "new",
      notes: "",
      signalValue: 3,
      subjectPreview: "Daily after-hours escalations are burning out Growth",
      createdAt: isoFromNow({ hours: 9 }),
      updatedAt: isoFromNow({ hours: 9 }),
    }),
    buildSubmission({
      id: "internal-004",
      formId: internalRiskForm.id,
      answers: {
        signal: "A second report says retaliation concern is low, but the same reporter also says teammates are afraid to attach their names.",
        team: "Trust & Safety",
        risk_theme: "Retaliation",
        escalation: "Medium",
      },
      aiSummary: "Contradictory tone suggests retaliation risk may be understated in the raw checkbox value.",
      severity: "medium",
      emotion: "guarded",
      keywords: ["internal", "retaliation", "contradiction", "anonymous"],
      clusterId: "Trust access escalation",
      status: "read",
      priority: "medium",
      triageStatus: "investigating",
      notes: buildReviewerNotes("Useful example for showing AI catching contradiction beyond the dropdown answer.", "ops@deepsignal", isoFromNow({ hours: 3 })),
      signalValue: 3,
      subjectPreview: "Retaliation risk may be understated",
      createdAt: isoFromNow({ hours: 11 }),
      updatedAt: isoFromNow({ hours: 3 }),
    }),
  ];
}

function buildProductFeedbackSubmissions() {
  return [
    buildSubmission({
      id: "feedback-001",
      formId: productFeedbackForm.id,
      answers: {
        signal: "The new inbox filters look powerful, but on mobile they are buried and I cannot find high-urgency signals fast enough.",
        surface: "Inbox",
        pain_point: "Filters",
        priority: "High",
      },
      aiSummary: "Mobile filter discoverability is blocking high-urgency signal triage.",
      severity: "high",
      emotion: "frustrated",
      keywords: ["feedback", "mobile", "filters", "urgency"],
      clusterId: "Inbox filter friction",
      status: "unread",
      priority: "high",
      triageStatus: "new",
      notes: "",
      signalValue: 5,
      subjectPreview: "Mobile filters hide urgent signals",
      createdAt: isoFromNow({ hours: 3 }),
      updatedAt: isoFromNow({ hours: 3 }),
    }),
    buildSubmission({
      id: "feedback-002",
      formId: productFeedbackForm.id,
      answers: {
        signal: "Search feels broken because relevant signals disappear when I combine map and inbox filters even though the result count says they exist.",
        surface: "Map",
        pain_point: "Search",
        priority: "High",
      },
      aiSummary: "Possible search anomaly: result count conflicts with visible signal list.",
      severity: "high",
      emotion: "angry",
      keywords: ["feedback", "search", "map", "contradiction"],
      clusterId: "Search contradiction",
      status: "read",
      priority: "high",
      triageStatus: "investigating",
      notes: buildReviewerNotes("Strong demo example of AI surfacing contradictory evidence, not just sentiment.", "product@deepsignal", isoFromNow({ hours: 1 })),
      signalValue: 4,
      subjectPreview: "Search result count conflicts with visible signals",
      createdAt: isoFromNow({ hours: 6 }),
      updatedAt: isoFromNow({ hours: 1 }),
    }),
    buildSubmission({
      id: "feedback-003",
      formId: productFeedbackForm.id,
      answers: {
        signal: "Notifications are finally useful. Keep the anomaly alerts, but let me route them directly into one action queue.",
        surface: "Notifications",
        pain_point: "Collaboration",
        priority: "Medium",
      },
      aiSummary: "Positive momentum around anomaly alerts with clear opportunity for action routing.",
      severity: "medium",
      emotion: "hopeful",
      keywords: ["feedback", "alerts", "routing", "opportunity"],
      clusterId: "Action routing request",
      status: "read",
      priority: "medium",
      triageStatus: "planned",
      notes: buildReviewerNotes("Keep this visible as positive momentum, not just complaints.", "pm@deepsignal", isoFromNow({ minutes: 45 })),
      signalValue: 3,
      subjectPreview: "Anomaly alerts are working but routing is missing",
      createdAt: isoFromNow({ hours: 8 }),
      updatedAt: isoFromNow({ minutes: 45 }),
    }),
    buildSubmission({
      id: "feedback-004",
      formId: productFeedbackForm.id,
      answers: {
        signal: "Performance collapsed only once today when the timeline opened with 200 signals. Everything else feels smooth, so this might be an outlier but it was bad.",
        surface: "Mobile",
        pain_point: "Performance",
        priority: "Medium",
      },
      aiSummary: "Single strong outlier suggests timeline performance issue under heavy signal load.",
      severity: "medium",
      emotion: "concerned",
      keywords: ["feedback", "performance", "timeline", "outlier"],
      clusterId: "Timeline performance outlier",
      status: "unread",
      priority: "medium",
      triageStatus: "new",
      notes: "",
      signalValue: 3,
      subjectPreview: "Timeline performance collapsed on a heavy load",
      createdAt: isoFromNow({ hours: 10 }),
      updatedAt: isoFromNow({ hours: 10 }),
    }),
  ];
}

export function buildInsightsFixtureSubmissions(mode: InsightsFixtureMode) {
  switch (mode) {
    case "tokyo_earthquake":
      return buildTokyoEarthquakeSubmissions();
    case "internal_risk":
      return buildInternalRiskSubmissions();
    case "product_feedback":
      return buildProductFeedbackSubmissions();
    case "combined":
    default:
      return [
        ...buildTokyoEarthquakeSubmissions(),
        ...buildInternalRiskSubmissions(),
        ...buildProductFeedbackSubmissions(),
      ];
  }
}

function getFormsForMode(mode: InsightsFixtureMode) {
  switch (mode) {
    case "tokyo_earthquake":
      return [earthquakeForm];
    case "internal_risk":
      return [internalRiskForm];
    case "product_feedback":
      return [productFeedbackForm];
    case "combined":
    default:
      return analysisFixtureForms;
  }
}

export async function clearInsightsFixtureWorkspace() {
  forcePurgeFormArtifacts({
    formIds: [...INSIGHTS_FIXTURE_FORM_IDS],
    manifestBlobIds: analysisFixtureForms.map((form) => form.manifestBlobId ?? "").filter(Boolean),
    blobIds: analysisFixtureForms.map((form) => form.blobId ?? "").filter(Boolean),
  });
  clearFixtureMeta();
}

export async function seedInsightsFixtureWorkspace(mode: InsightsFixtureMode) {
  await clearInsightsFixtureWorkspace();
  const forms = getFormsForMode(mode);
  await Promise.all(
    forms.map((form) =>
      localStorageAdapter.saveForm({
        ...form,
        createdAt: form.createdAt,
        updatedAt: isoFromNow({ minutes: 1 }),
      }),
    ),
  );
  const submissions = buildInsightsFixtureSubmissions(mode);
  await Promise.all(submissions.map((submission) => localStorageAdapter.saveSubmission(submission)));
  const meta = {
    formIds: forms.map((form) => form.id),
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
