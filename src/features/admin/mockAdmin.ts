import { useEffect, useState } from "react";
import type { CapabilityProfile, DebugOwnedObject } from "../../hooks/useAccessControl";
import type { ProjectSummary } from "../../lib/projectRegistry";
import type { FormSchema, Submission } from "../../types";

export const MOCK_ADMIN_STORAGE_KEY = "deepsignal.mockAdmin";
export const MOCK_ADMIN_WALLET_ADDRESS =
  "0x4d0c000000000000000000000000000000000000000000000000000000000001";
export const MOCK_ADMIN_PROJECT_ID =
  "0x4d0c0000000000000000000000000000000000000000000000000000000000aa";

export interface MockAdminWorkspaceData {
  accountAddress: string;
  capabilityProfile: CapabilityProfile;
  ownedObjects: DebugOwnedObject[];
  project: ProjectSummary;
  forms: FormSchema[];
  submissionsByFormId: Record<string, Submission[]>;
}

function isMockAdminCapabilityAvailable() {
  return !import.meta.env.PROD && (import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK_ADMIN === "true");
}

function readMockAdminStorageFlag() {
  if (!isMockAdminCapabilityAvailable() || typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(MOCK_ADMIN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function resolveMockAdminActive(search: string) {
  if (!isMockAdminCapabilityAvailable()) {
    return false;
  }
  const params = new URLSearchParams(search);
  const queryValue = params.get("mockAdmin");
  if (queryValue === "1") {
    try {
      window.localStorage.setItem(MOCK_ADMIN_STORAGE_KEY, "1");
    } catch {
      // Ignore storage failures; the query flag still activates the current session.
    }
    return true;
  }
  if (queryValue === "0") {
    try {
      window.localStorage.removeItem(MOCK_ADMIN_STORAGE_KEY);
    } catch {
      // Best effort only.
    }
    return false;
  }
  return readMockAdminStorageFlag();
}

export function useMockAdminMode(search: string) {
  const [, setStorageFlagVersion] = useState(0);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === MOCK_ADMIN_STORAGE_KEY) {
        setStorageFlagVersion((value) => value + 1);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return {
    available: isMockAdminCapabilityAvailable(),
    enabled: resolveMockAdminActive(search),
  };
}

export function createMockAdminWorkspaceData(now = new Date()): MockAdminWorkspaceData {
  const createdAt = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  const project: ProjectSummary = {
    objectId: MOCK_ADMIN_PROJECT_ID,
    name: "Mock Signal Operations",
    owner: MOCK_ADMIN_WALLET_ADDRESS,
    admins: [MOCK_ADMIN_WALLET_ADDRESS],
    reviewers: [
      "0x4d0c000000000000000000000000000000000000000000000000000000000002",
    ],
    members: [
      { address: MOCK_ADMIN_WALLET_ADDRESS, role: "owner", roleCode: 0 },
      {
        address: "0x4d0c000000000000000000000000000000000000000000000000000000000002",
        role: "reviewer",
        roleCode: 2,
      },
    ],
    formsCount: 2,
    signalsCount: 6,
    createdAt: createdAt(240),
    ownedOwnerCapId: "0x4d0c0000000000000000000000000000000000000000000000000000000000ff",
    onchainForms: [
      {
        formId: 1,
        title: "Operations Intake",
        metadataDigest: "mock-form-digest-operations",
        manifestBlobId: "walrus-mock-manifest-operations",
        active: true,
        createdAt: createdAt(230),
      },
    ],
    onchainSignals: [],
  };

  const operationsForm: FormSchema = {
    id: "mock-admin-operations",
    title: "Operations Intake",
    description: "Mock live operational signal stream for admin UI verification.",
    fields: [
      { id: "summary", type: "longText", label: "Signal summary", required: true, sensitive: false },
      { id: "location", type: "shortText", label: "Location", required: false, sensitive: false },
      { id: "impact", type: "dropdown", label: "Impact", required: true, sensitive: false, options: ["Low", "Medium", "High"] },
      { id: "evidence", type: "screenshot", label: "Evidence", required: false, sensitive: true },
    ],
    createdAt: createdAt(230),
    updatedAt: createdAt(15),
    ownerAddress: MOCK_ADMIN_WALLET_ADDRESS,
    creationMode: "admin",
    encryptSubmissions: true,
    projectId: project.objectId,
    projectName: project.name,
    onchainFormId: 1,
    registrationMode: "sui",
    manifestBlobId: "walrus-mock-manifest-operations",
    blobId: "walrus-mock-form-operations",
    signalType: "operation",
    analystType: "operations",
  };

  const productForm: FormSchema = {
    id: "mock-admin-product",
    title: "Product Signal Review",
    description: "Mock product and responder feedback stream.",
    fields: [
      { id: "summary", type: "longText", label: "Signal summary", required: true, sensitive: false },
      { id: "surface", type: "dropdown", label: "Surface", required: false, sensitive: false, options: ["Inbox", "Mobile", "Explore"] },
      { id: "rating", type: "rating", label: "Signal value", required: false, sensitive: false },
    ],
    createdAt: createdAt(180),
    updatedAt: createdAt(20),
    ownerAddress: MOCK_ADMIN_WALLET_ADDRESS,
    creationMode: "admin",
    encryptSubmissions: false,
    projectId: project.objectId,
    projectName: project.name,
    registrationMode: "walrus",
    manifestBlobId: "walrus-mock-manifest-product",
    blobId: "walrus-mock-form-product",
    signalType: "product_voice",
    analystType: "product",
  };

  const submissionsByFormId: Record<string, Submission[]> = {
    [operationsForm.id]: [
      {
        id: "mock-signal-encrypted-high-attachment",
        formId: operationsForm.id,
        formVersion: 1,
        projectId: project.objectId,
        answers: {},
        publicPayload: {
          subjectPreview: "High-priority encrypted field report with image evidence",
          attachments: [
            {
              fieldId: "evidence",
              type: "image",
              blobId: "walrus-mock-attachment-thermal-map",
              name: "thermal-map.jpg",
              size: 842_112,
              encrypted: true,
              walrusProof: { blobId: "walrus-mock-attachment-thermal-map", network: "testnet", objectId: "0xmockattachment01" },
            },
          ],
        },
        attachments: [
          {
            fieldId: "evidence",
            type: "image",
            blobId: "walrus-mock-attachment-thermal-map",
            name: "thermal-map.jpg",
            size: 842_112,
            encrypted: true,
            walrusProof: { blobId: "walrus-mock-attachment-thermal-map", network: "testnet", objectId: "0xmockattachment01" },
          },
        ],
        category: "general",
        aiSummary: "Encrypted source reports a fast-moving operations risk with attached field evidence.",
        severity: "high",
        emotion: "urgent",
        keywords: ["encrypted", "field evidence", "escalation"],
        clusterId: "Field escalation",
        status: "unread",
        priority: "high",
        triageStatus: "new",
        tags: ["encrypted", "attachment", "priority-high"],
        notes: "Mock case: encrypted, unread, high priority, attachment present.",
        signalValue: 94,
        isEncrypted: true,
        encryptedBlobId: "walrus-mock-encrypted-high-attachment",
        encryptedPayload: "mock-seal-envelope-v1:encrypted-high-attachment",
        receiptBlobId: "walrus-mock-receipt-high-attachment",
        sealIdentity: `seal:mock:${project.objectId}`,
        pendingOnchainRegistration: true,
        subjectPreview: "Encrypted field escalation",
        createdAt: createdAt(8),
        updatedAt: createdAt(8),
        blobId: "walrus-mock-submission-high-attachment",
        walrusProof: { blobId: "walrus-mock-submission-high-attachment", network: "testnet", objectId: "0xmocksubmission01" },
      },
      {
        id: "mock-signal-decrypt-failed",
        formId: operationsForm.id,
        formVersion: 1,
        projectId: project.objectId,
        answers: {},
        attachments: [],
        publicPayload: {
          subjectPreview: "Private payload reference cannot be recovered",
        },
        metadata: { mockDecryptState: "failed", failureReason: "encrypted payload blob missing" },
        category: "bug",
        aiSummary: "Encrypted signal metadata exists, but the payload reference is unavailable.",
        severity: "medium",
        emotion: "concerned",
        keywords: ["decrypt failure", "missing payload", "recovery"],
        clusterId: "Decrypt recovery",
        status: "unread",
        priority: "medium",
        triageStatus: "investigating",
        tags: ["encrypted", "decrypt-failed", "recovery"],
        notes: "Mock case: decryption failure state for diagnostics UI.",
        signalValue: 71,
        isEncrypted: true,
        encryptedBlobId: "walrus-mock-missing-encrypted-payload",
        receiptBlobId: "walrus-mock-receipt-decrypt-failed",
        sealIdentity: `seal:mock:${project.objectId}`,
        subjectPreview: "Decrypt recovery needed",
        createdAt: createdAt(24),
        updatedAt: createdAt(18),
        blobId: "walrus-mock-submission-decrypt-failed",
      },
      {
        id: "mock-signal-verified-read",
        formId: operationsForm.id,
        formVersion: 1,
        projectId: project.objectId,
        answers: {
          summary: "Verified responder confirms the earlier incident is contained but needs follow-up monitoring.",
          location: "North sector relay",
          impact: "Medium",
        },
        attachments: [],
        respondentMeta: {
          walletAddress: "0x4d0c00000000000000000000000000000000000000000000000000000000beef",
          chain: "sui",
          submittedAt: createdAt(42),
          isAnonymous: false,
          identityKind: "sui_wallet",
          verifiedAddress: "0x4d0c00000000000000000000000000000000000000000000000000000000beef",
        },
        category: "general",
        aiSummary: "Verified follow-up indicates the incident is contained but not closed.",
        severity: "medium",
        emotion: "neutral",
        keywords: ["verified", "follow-up", "contained"],
        clusterId: "Field escalation",
        status: "read",
        priority: "medium",
        triageStatus: "investigating",
        tags: ["verified", "needs-follow-up"],
        notes: "",
        signalValue: 66,
        isEncrypted: false,
        receiptBlobId: "walrus-mock-receipt-verified-read",
        onchainSignalId: 4,
        onchainStatus: "triaged",
        signalReceiptMetadataDigest: "mock-signal-digest-verified-read",
        subjectPreview: "Verified containment update",
        createdAt: createdAt(42),
        updatedAt: createdAt(30),
        blobId: "walrus-mock-submission-verified-read",
      },
    ],
    [productForm.id]: [
      {
        id: "mock-signal-mobile-layout",
        formId: productForm.id,
        formVersion: 1,
        projectId: project.objectId,
        answers: {
          summary: "On iPhone width the inbox filter and detail pane need to stay readable during triage.",
          surface: "Mobile",
          rating: 4,
        },
        attachments: [],
        category: "feature",
        aiSummary: "Mobile reviewers need dense but readable filter and detail controls.",
        severity: "low",
        emotion: "constructive",
        keywords: ["mobile", "inbox", "filters"],
        clusterId: "Mobile review",
        status: "unread",
        priority: "low",
        triageStatus: "new",
        tags: ["mobile", "layout"],
        notes: "",
        signalValue: 58,
        isEncrypted: false,
        subjectPreview: "Mobile inbox filter layout",
        ratingValue: 4,
        createdAt: createdAt(55),
        updatedAt: createdAt(55),
        blobId: "walrus-mock-submission-mobile-layout",
      },
      {
        id: "mock-signal-archived",
        formId: productForm.id,
        formVersion: 1,
        projectId: project.objectId,
        answers: {
          summary: "Legacy export request was resolved and archived after operator review.",
          surface: "Inbox",
          rating: 3,
        },
        attachments: [],
        category: "feature",
        aiSummary: "Resolved product request kept for audit history.",
        severity: "low",
        emotion: "neutral",
        keywords: ["archive", "audit", "export"],
        clusterId: "Export workflow",
        status: "archived",
        priority: "low",
        triageStatus: "closed",
        tags: ["archived", "audit"],
        notes: "Mock case: archived signal for filters.",
        signalValue: 41,
        isEncrypted: false,
        subjectPreview: "Archived export request",
        ratingValue: 3,
        createdAt: createdAt(120),
        updatedAt: createdAt(70),
        blobId: "walrus-mock-submission-archived",
      },
    ],
  };

  return {
    accountAddress: MOCK_ADMIN_WALLET_ADDRESS,
    capabilityProfile: {
      isConfigured: true,
      packageId: "mock-package",
      registryId: "mock-registry",
      hasOwnerCap: true,
      hasAdminCap: true,
      hasReviewerCap: false,
      ownerCapIds: [project.ownedOwnerCapId ?? "mock-owner-cap"],
      adminCapIds: ["mock-admin-cap"],
      reviewerCapIds: [],
    },
    ownedObjects: [
      {
        objectId: project.ownedOwnerCapId ?? "mock-owner-cap",
        type: "mock::access::OwnerCap",
        registryId: "mock-registry",
      },
      {
        objectId: "mock-admin-cap",
        type: "mock::access::AdminCap",
        registryId: "mock-registry",
      },
    ],
    project,
    forms: [operationsForm, productForm],
    submissionsByFormId,
  };
}
