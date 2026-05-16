import { localStorageAdapter } from "../storage/localStorageAdapter";
import type { FormSchema, Submission } from "../types";

export const DEMO_FORM_ID = "demo-product-signal";
export const DEMO_WORKSPACE_ID = "demo-workspace";

const demoCreatedAt = "2026-05-17T01:30:00.000Z";

export const demoForm: FormSchema = {
  id: DEMO_FORM_ID,
  title: "Private beta signal intake",
  description: "Collect wallet-optional product feedback, protect sensitive context, and triage it in SignalInbox.",
  fields: [
    {
      id: "signal",
      type: "longText",
      label: "What should the team understand?",
      required: true,
      sensitive: true,
      placeholder: "Share the blocker, request, or workflow detail.",
    },
    {
      id: "area",
      type: "dropdown",
      label: "Which area is this about?",
      required: true,
      sensitive: false,
      options: ["Onboarding", "Storage", "Encryption", "Exports"],
    },
    {
      id: "impact",
      type: "rating",
      label: "Impact",
      required: true,
      sensitive: false,
    },
  ],
  sections: [
    {
      id: "core",
      title: "Signal",
      description: "A short path from public feedback to encrypted review.",
    },
  ],
  purpose: "feature",
  visibility: "unlisted",
  identityPolicy: "anonymous_allowed",
  publicExplore: false,
  createdAt: demoCreatedAt,
  updatedAt: demoCreatedAt,
  ownerAddress: "0xdemo000000000000000000000000000000000000000000000000000000000001",
  creationMode: "admin",
  encryptSubmissions: false,
  projectId: DEMO_WORKSPACE_ID,
  projectName: "DeepSignal Contest Workspace",
  registrationMode: "walrus",
  blobId: "demo-walrus-form-7a91",
  manifestBlobId: "demo-manifest-4fd2",
};

export const demoSubmissions: Submission[] = [
  {
    id: "demo-signal-001",
    formId: DEMO_FORM_ID,
    answers: {
      signal:
        "The public form is easy to share, but the review team needs one place to see urgency, storage proof, and export-ready rows.",
      area: "Onboarding",
      impact: "5",
    },
    attachments: [],
    respondentMeta: {
      chain: "sui",
      submittedAt: "2026-05-17T01:42:00.000Z",
      isAnonymous: true,
      sessionId: "anon-demo-session",
    },
    category: "feature",
    aiSummary: "High-value onboarding signal asking for a unified private review queue with proof and export.",
    severity: "high",
    emotion: "focused",
    keywords: ["onboarding", "review queue", "export"],
    clusterId: "demo-onboarding",
    status: "unread",
    priority: "high",
    triageStatus: "investigating",
    tags: ["contest-demo", "product"],
    notes: "Demo note: route this into the launch-readiness review.",
    contributorId: "anon-demo-session",
    signalValue: 5,
    isEncrypted: false,
    subjectPreview: "Unified private review queue",
    ratingValue: 5,
    pendingOnchainRegistration: true,
    createdAt: "2026-05-17T01:42:00.000Z",
    updatedAt: "2026-05-17T01:42:00.000Z",
    blobId: "demo-signal-blob-001",
  },
  {
    id: "demo-signal-002",
    formId: DEMO_FORM_ID,
    answers: {
      signal: "CSV export should preserve triage notes and keep wallet addresses optional for privacy reviews.",
      area: "Exports",
      impact: "4",
    },
    attachments: [],
    respondentMeta: {
      chain: "sui",
      submittedAt: "2026-05-17T01:47:00.000Z",
      isAnonymous: false,
      walletAddress: "0x9a0f12b7c8d4e5f60123456789abcdef123456789abcdef123456789abcde01",
    },
    category: "feature",
    aiSummary: "Export workflow request focused on privacy controls and operator handoff.",
    severity: "medium",
    emotion: "practical",
    keywords: ["csv", "privacy", "triage"],
    clusterId: "demo-exports",
    status: "read",
    priority: "medium",
    triageStatus: "planned",
    tags: ["export", "privacy"],
    notes: "Show the confirmation step before download in the demo.",
    contributorId: "0x9a0f12b7c8d4e5f60123456789abcdef123456789abcdef123456789abcde01",
    signalValue: 4,
    isEncrypted: false,
    subjectPreview: "Privacy-safe CSV export",
    ratingValue: 4,
    createdAt: "2026-05-17T01:47:00.000Z",
    updatedAt: "2026-05-17T01:50:00.000Z",
    blobId: "demo-signal-blob-002",
  },
  {
    id: "demo-signal-003",
    formId: DEMO_FORM_ID,
    answers: {},
    attachments: [],
    publicPayload: {
      subjectPreview: "Sensitive enterprise feedback",
      ratingValue: 5,
    },
    respondentMeta: {
      chain: "sui",
      submittedAt: "2026-05-17T01:55:00.000Z",
      isAnonymous: true,
      sessionId: "anon-sealed-demo",
    },
    category: "bug",
    severity: "high",
    emotion: "concerned",
    status: "unread",
    priority: "high",
    triageStatus: "new",
    tags: ["sealed", "enterprise"],
    notes: "",
    contributorId: "anon-sealed-demo",
    signalValue: 5,
    isEncrypted: true,
    encryptedBlobId: "demo-sealed-payload-003",
    sealIdentity: "seal:demo-package:demo-policy",
    subjectPreview: "Sensitive enterprise feedback",
    ratingValue: 5,
    createdAt: "2026-05-17T01:55:00.000Z",
    updatedAt: "2026-05-17T01:55:00.000Z",
    blobId: "demo-signal-blob-003",
  },
];

export async function seedDemoWorkspace() {
  await localStorageAdapter.saveForm(demoForm);
  await Promise.all(demoSubmissions.map((submission) => localStorageAdapter.saveSubmission(submission)));
}

export function createDemoLiveSubmission(answer: string): Submission {
  const createdAt = new Date().toISOString();
  return {
    id: `demo-live-${Date.now()}`,
    formId: DEMO_FORM_ID,
    answers: {
      signal: answer,
      area: "Storage",
      impact: "5",
    },
    attachments: [],
    respondentMeta: {
      chain: "sui",
      submittedAt: createdAt,
      isAnonymous: true,
      sessionId: "demo-live-session",
    },
    category: "feature",
    aiSummary: "Fresh demo response captured through the wallet-optional public flow.",
    severity: "medium",
    emotion: "curious",
    keywords: ["live demo", "wallet optional", "walrus"],
    status: "unread",
    priority: "high",
    triageStatus: "new",
    tags: ["live-demo"],
    notes: "",
    contributorId: "demo-live-session",
    signalValue: 5,
    isEncrypted: false,
    subjectPreview: answer.slice(0, 80),
    ratingValue: 5,
    createdAt,
    updatedAt: createdAt,
    blobId: `demo-live-blob-${Date.now()}`,
  };
}
