import { encryptSensitiveResponse } from "../crypto/sealService";
import { parseRealSealEnvelope } from "../crypto/sealPayload";
import { NEEDS_FOLLOW_UP_TAG, serializeReviewNotes } from "../lib/reviewCollaboration";
import { localStorageAdapter } from "../storage/localStorageAdapter";
import type { FormSchema, Submission } from "../types";

export const DEMO_FORM_ID = "demo-signal-operations-workspace";
export const DEMO_WORKSPACE_ID = "demo-workspace";
export const DEMO_PRIMARY_SIGNAL_ID = "demo-signal-security-001";

const demoCreatedAt = "2026-05-17T01:30:00.000Z";

function buildReviewerNotes(notes: string, reviewer: string, noteUpdatedAt: string) {
  return serializeReviewNotes(notes, {
    reviewer,
    noteUpdatedAt,
  });
}

export const demoForm: FormSchema = {
  id: DEMO_FORM_ID,
  title: "Secure Signal Operations demo intake",
  description:
    "Demo signals for related reports, encrypted review, reviewer assignment, and roadmap-safe triage in DeepSignal.",
  fields: [
    {
      id: "signal",
      type: "longText",
      label: "What happened?",
      required: true,
      sensitive: true,
      placeholder: "Share the blocker, report, or workflow detail.",
    },
    {
      id: "surface",
      type: "dropdown",
      label: "Which surface is affected?",
      required: true,
      sensitive: false,
      options: ["Wallet recovery", "Security", "Moderation", "Roadmap"],
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
      description: "A quick path from public signal intake to secure review operations.",
    },
  ],
  purpose: "bug",
  visibility: "unlisted",
  identityPolicy: "anonymous_allowed",
  publicExplore: false,
  createdAt: demoCreatedAt,
  updatedAt: demoCreatedAt,
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
    id: DEMO_PRIMARY_SIGNAL_ID,
    formId: DEMO_FORM_ID,
    answers: {
      signal:
        "Anonymous security report: session recovery tokens can be replayed when the recovery flow is resumed from a stale mobile tab.",
      surface: "Security",
      impact: "5",
    },
    attachments: [],
    publicPayload: {
      subjectPreview: "Anonymous security report",
      ratingValue: 5,
    },
    respondentMeta: {
      chain: "sui",
      submittedAt: "2026-05-17T01:42:00.000Z",
      isAnonymous: true,
      sessionId: "anon-security-demo",
    },
    category: "bug",
    aiSummary: "Anonymous encrypted security report about stale recovery tokens on mobile resume.",
    severity: "high",
    emotion: "urgent",
    keywords: ["security", "token", "recovery", "mobile"],
    clusterId: "demo-security",
    status: "unread",
    priority: "high",
    triageStatus: "new",
    tags: ["contest-demo", "security", NEEDS_FOLLOW_UP_TAG],
    notes: buildReviewerNotes(
      "Potential auth bypass. Verify whether stale restore sessions keep recovery tokens active after resume.",
      "alex@deepsignal",
      "2026-05-17T01:45:00.000Z",
    ),
    contributorId: "anon-security-demo",
    signalValue: 5,
    isEncrypted: true,
    encryptedBlobId: "demo-sealed-payload-security-001",
    sealIdentity: "seal:demo-package:demo-policy",
    subjectPreview: "Anonymous security report",
    ratingValue: 5,
    createdAt: "2026-05-17T01:42:00.000Z",
    updatedAt: "2026-05-17T01:45:00.000Z",
    blobId: "demo-signal-blob-security-001",
  },
  {
    id: "demo-signal-recovery-002",
    formId: DEMO_FORM_ID,
    answers: {
      signal:
        "Wallet recovery failed on iOS after Face ID approval. The restore sheet closes and the inbox never resumes the pending challenge.",
      surface: "Wallet recovery",
      impact: "4",
    },
    attachments: [],
    respondentMeta: {
      chain: "sui",
      submittedAt: "2026-05-17T01:47:00.000Z",
      isAnonymous: false,
      walletAddress: "0x9a0f12b7c8d4e5f60123456789abcdef123456789abcdef123456789abcde01",
    },
    category: "bug",
    aiSummary: "Verified report that wallet recovery fails on iOS after biometric approval.",
    severity: "high",
    emotion: "frustrated",
    keywords: ["wallet recovery", "ios", "face id"],
    clusterId: "demo-wallet-recovery",
    status: "read",
    priority: "high",
    triageStatus: "investigating",
    tags: ["wallet-recovery", "ios", "mobile"],
    notes: buildReviewerNotes(
      "Looks related to the Safari report. Reproduce on iPhone before moving to roadmap.",
      "maya@deepsignal",
      "2026-05-17T01:51:00.000Z",
    ),
    contributorId: "0x9a0f12b7c8d4e5f60123456789abcdef123456789abcdef123456789abcde01",
    signalValue: 4,
    isEncrypted: false,
    subjectPreview: "Wallet recovery failed on iOS",
    ratingValue: 4,
    createdAt: "2026-05-17T01:47:00.000Z",
    updatedAt: "2026-05-17T01:51:00.000Z",
    blobId: "demo-signal-blob-recovery-002",
  },
  {
    id: "demo-signal-recovery-003",
    formId: DEMO_FORM_ID,
    answers: {
      signal:
        "Wallet recovery failed on Safari during restore. The browser returns to the inbox, but the recovery approval never completes and the challenge remains locked.",
      surface: "Wallet recovery",
      impact: "4",
    },
    attachments: [],
    respondentMeta: {
      chain: "sui",
      submittedAt: "2026-05-17T01:49:30.000Z",
      isAnonymous: true,
      sessionId: "anon-safari-demo",
    },
    category: "bug",
    aiSummary: "Anonymous report that Safari restore does not resume the pending wallet recovery challenge.",
    severity: "medium",
    emotion: "concerned",
    keywords: ["wallet recovery", "safari", "restore"],
    clusterId: "demo-wallet-recovery",
    status: "unread",
    priority: "medium",
    triageStatus: "investigating",
    tags: ["wallet-recovery", "safari", "mobile"],
    notes: "",
    contributorId: "anon-safari-demo",
    signalValue: 4,
    isEncrypted: false,
    subjectPreview: "Wallet recovery failed on Safari",
    ratingValue: 4,
    createdAt: "2026-05-17T01:49:30.000Z",
    updatedAt: "2026-05-17T01:49:30.000Z",
    blobId: "demo-signal-blob-recovery-003",
  },
  {
    id: "demo-signal-abuse-004",
    formId: DEMO_FORM_ID,
    answers: {
      signal:
        "High priority abuse report: impersonation submissions are bypassing the moderation checklist and reaching trusted intake reviewers.",
      surface: "Moderation",
      impact: "5",
    },
    attachments: [],
    publicPayload: {
      subjectPreview: "High priority abuse report",
      ratingValue: 5,
    },
    respondentMeta: {
      chain: "sui",
      submittedAt: "2026-05-17T01:54:00.000Z",
      isAnonymous: false,
      walletAddress: "0x8bce12b7c8d4e5f60123456789abcdef123456789abcdef123456789abcde09",
    },
    category: "bug",
    aiSummary: "Encrypted abuse escalation about impersonation reports reaching trusted operators.",
    severity: "high",
    emotion: "urgent",
    keywords: ["abuse", "moderation", "impersonation"],
    clusterId: "demo-abuse",
    status: "read",
    priority: "high",
    triageStatus: "planned",
    tags: ["abuse", "moderation", NEEDS_FOLLOW_UP_TAG],
    notes: buildReviewerNotes(
      "Escalate to trust operations. Safe metadata can move to roadmap once the impersonation filter patch is scheduled.",
      "trust@deepsignal",
      "2026-05-17T01:58:00.000Z",
    ),
    contributorId: "0x8bce12b7c8d4e5f60123456789abcdef123456789abcdef123456789abcde09",
    signalValue: 5,
    githubIssueUrl: "https://github.com/example/deepsignal/issues/42",
    isEncrypted: true,
    encryptedBlobId: "demo-sealed-payload-abuse-004",
    sealIdentity: "seal:demo-package:demo-policy",
    subjectPreview: "High priority abuse report",
    ratingValue: 5,
    createdAt: "2026-05-17T01:54:00.000Z",
    updatedAt: "2026-05-17T01:58:00.000Z",
    blobId: "demo-signal-blob-abuse-004",
  },
  {
    id: "demo-signal-roadmap-005",
    formId: DEMO_FORM_ID,
    answers: {
      signal:
        "Roadmap feature request: keep safe metadata public while sealing private payload details, so reviewers can publish progress without exposing internal notes.",
      surface: "Roadmap",
      impact: "3",
    },
    attachments: [],
    respondentMeta: {
      chain: "sui",
      submittedAt: "2026-05-17T02:02:00.000Z",
      isAnonymous: false,
      walletAddress: "0x1f0f12b7c8d4e5f60123456789abcdef123456789abcdef123456789abcde77",
    },
    category: "feature",
    aiSummary: "Feature request to publish roadmap-safe metadata while private reviewer context remains sealed.",
    severity: "medium",
    emotion: "hopeful",
    keywords: ["roadmap", "metadata", "seal"],
    clusterId: "demo-roadmap",
    status: "read",
    priority: "medium",
    triageStatus: "fixed",
    tags: ["roadmap", "metadata", "public-safe"],
    notes: buildReviewerNotes(
      "Good candidate for the judge demo because it ends with a roadmap-safe outcome.",
      "product@deepsignal",
      "2026-05-17T02:06:00.000Z",
    ),
    contributorId: "0x1f0f12b7c8d4e5f60123456789abcdef123456789abcdef123456789abcde77",
    signalValue: 3,
    isEncrypted: false,
    subjectPreview: "Roadmap feature request",
    ratingValue: 3,
    createdAt: "2026-05-17T02:02:00.000Z",
    updatedAt: "2026-05-17T02:06:00.000Z",
    blobId: "demo-signal-blob-roadmap-005",
  },
];

async function saveDemoSubmission(submission: Submission) {
  if (!submission.isEncrypted) {
    await localStorageAdapter.saveSubmission(submission);
    return;
  }

  const publicPayload = submission.publicPayload ?? {
    subjectPreview: submission.subjectPreview,
    ratingValue: submission.ratingValue,
  };

  try {
    const encryptedPayload = await encryptSensitiveResponse(
      JSON.stringify({
        answers: submission.answers,
        attachments: submission.attachments,
        location: submission.location,
        metadata: submission.metadata,
      }),
      { projectId: demoForm.projectId, ownerAddress: demoForm.ownerAddress },
    );
    const parsedEnvelope = parseRealSealEnvelope(encryptedPayload);
    const savedEncryptedPayload = await localStorageAdapter.saveEncryptedPayload(encryptedPayload);
    await localStorageAdapter.saveSubmission({
      ...submission,
      answers: {},
      attachments: [],
      publicPayload,
      encryptedBlobId: savedEncryptedPayload.blobId,
      encryptedPayload: undefined,
      sealIdentity: parsedEnvelope ? `seal:${parsedEnvelope.packageId}:${parsedEnvelope.objectId}` : submission.sealIdentity,
    });
  } catch {
    await localStorageAdapter.saveSubmission({
      ...submission,
      answers: {},
      attachments: [],
      publicPayload,
      encryptedPayload: undefined,
    });
  }
}

export async function seedDemoWorkspace() {
  await localStorageAdapter.saveForm(demoForm);
  await Promise.all(demoSubmissions.map((submission) => saveDemoSubmission(submission)));
  return {
    formId: demoForm.id,
    signalIds: demoSubmissions.map((submission) => submission.id),
    primarySignalId: DEMO_PRIMARY_SIGNAL_ID,
  };
}

export function createDemoLiveSubmission(answer: string): Submission {
  const createdAt = new Date().toISOString();
  return {
    id: `demo-live-${Date.now()}`,
    formId: DEMO_FORM_ID,
    answers: {
      signal: answer,
      surface: "Roadmap",
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
