import { useEffect, useMemo, useRef, useState } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { canReviewForm } from "../../../lib/adminAccess";
import { isVerifiedSignal } from "../../../lib/respondentMeta";
import { getSubmissionRespondentMeta } from "../../../lib/respondentMeta";
import { fetchJsonBlob, readManifestWithForm } from "../../../lib/walrus";
import { useProjectRegistry } from "../../../hooks/useProjectRegistry";
import {
  getSignalPreview,
  getSignalSubject,
  inferSignalCategory,
  type SignalCategory,
} from "../../../lib/signalInbox";
import { isLocalFallbackBlob } from "../../../lib/proof";
import {
  getAssignedReviewer,
  getVisibleReviewerNotes,
  hasNeedsFollowUp,
} from "../../../lib/reviewCollaboration";
import type {
  OnchainProjectFormSummary,
  OnchainProjectSignalSummary,
  ProjectSummary,
} from "../../../lib/projectRegistry";
import {
  getSelectedProjectId,
  isProjectObjectType,
  parseProjectSummary,
  parseSuiObjectData,
  subscribeProjectRegistryStorageChange,
} from "../../../lib/projectRegistry";
import {
  normalizeForm,
  normalizeSubmission,
  storageAdapter,
} from "../../../lib/storage";
import { flattenAnswer } from "../../../lib/utils";
import { endPerf, measurePerf, startPerf } from "../../../lib/perf";
import type { CapabilityProfile } from "../../../hooks/useAccessControl";
import type { FormSchema, Submission } from "../../../types";
import { localStorageAdapter } from "../../../storage/localStorageAdapter";
import { upsertFormBlobIndex } from "../../../storage/blobIndex";
import { isDeletedFormTombstone } from "../../../storage/deletedFormTombstones";
import { saveFormMetadataOverlay } from "../../../storage/formMetadataOverlay";
import {
  fetchRemoteSubmissionIndex,
  getRemoteSubmissionIndexSource,
  writeOwnerSubmissionIndexFetchLog,
} from "../../../storage/submissionDelivery";

export interface FormWithCount extends FormSchema {
  submissionCount: number;
}

export type StreamId =
  | "all"
  | "needs_review"
  | "follow_up"
  | "unresolved"
  | "unread"
  | "verified"
  | "anonymous"
  | "published"
  | "encrypted"
  | "high"
  | "pending_sui"
  | "registered_sui"
  | "bug"
  | "feature"
  | "archived";

export type SignalSortOrder = "default" | "newest" | "oldest" | "priority" | "unread";
export type SignalViewScope = "all" | "project";

export interface SignalRecord {
  form: FormWithCount;
  submission: Submission;
  category: SignalCategory;
  searchText: string;
}

function mergeFormUpdate(currentForm: FormWithCount, nextForm: FormWithCount) {
  return {
    ...currentForm,
    ...nextForm,
    submissionCount: nextForm.submissionCount ?? currentForm.submissionCount,
  } satisfies FormWithCount;
}

type SignalIdentityTarget = {
  submissionId?: string;
  receiptBlobId?: string;
  signalReceiptMetadataDigest?: string;
  projectId?: string | null;
  onchainSignalId?: number;
};

const ADMIN_SUBMISSION_BATCH_SIZE = 4;
const ONCHAIN_SIGNAL_BATCH_SIZE = 4;
const MANIFEST_RESTORE_TIMEOUT_MS = 2500;
const INBOX_BACKGROUND_TASK_TIMEOUT_MS = 1200;

function getViewerRole(capabilityProfile: CapabilityProfile, accountAddress?: string | null) {
  if (!accountAddress) {
    return "disconnected";
  }
  if (capabilityProfile.hasOwnerCap) {
    return "owner";
  }
  if (capabilityProfile.hasAdminCap) {
    return "admin";
  }
  if (capabilityProfile.hasReviewerCap) {
    return "reviewer";
  }
  return capabilityProfile.isConfigured ? "none" : "legacy";
}

function scheduleInboxBackgroundTask(task: () => void) {
  if (typeof window === "undefined") {
    task();
    return;
  }
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(task, { timeout: INBOX_BACKGROUND_TASK_TIMEOUT_MS });
    return;
  }
  globalThis.setTimeout(task, 0);
}

function buildLightweightSearchText(form: FormWithCount, submission: Submission, category: SignalCategory) {
  return [
    form.title,
    getSignalSubject(submission),
    getSignalPreview(submission),
    submission.tags.join(" "),
    getAssignedReviewer(submission) ?? "",
    getVisibleReviewerNotes(submission),
    category,
    form.projectName ?? "",
    form.signalType ?? "",
    form.analystType ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function matchesDeepSearch(record: SignalRecord, normalizedSearch: string) {
  if (!normalizedSearch) {
    return true;
  }
  if (record.searchText.includes(normalizedSearch)) {
    return true;
  }
  return flattenAnswer(record.submission.answers).toLowerCase().includes(normalizedSearch);
}

function buildOnchainShadowFormId(projectId: string, onchainFormId: number) {
  return `onchain:${projectId}:${onchainFormId}`;
}

function buildOnchainShadowSignalId(projectId: string, signalId: number) {
  return `onchain:${projectId}:${signalId}`;
}

function buildProjectFormKey(projectId?: string | null, onchainFormId?: number | null) {
  if (!projectId || typeof onchainFormId !== "number") {
    return "";
  }
  return `${projectId}:${onchainFormId}`;
}

function buildProjectManifestKey(projectId?: string | null, manifestBlobId?: string | null) {
  if (!projectId || !manifestBlobId || isLocalFallbackBlob(manifestBlobId)) {
    return "";
  }
  return `${projectId}:${manifestBlobId}`;
}

function buildSignalIdentityKeys(target: SignalIdentityTarget) {
  const keys = new Set<string>();
  if (target.submissionId) {
    keys.add(`submission:${target.submissionId}`);
  }
  if (target.receiptBlobId) {
    keys.add(`receipt:${target.receiptBlobId}`);
  }
  if (target.signalReceiptMetadataDigest) {
    keys.add(`digest:${target.signalReceiptMetadataDigest}`);
  }
  if (target.projectId && typeof target.onchainSignalId === "number") {
    keys.add(`onchain:${target.projectId}:${target.onchainSignalId}`);
  }
  return keys;
}

function matchesSignalIdentity(left: SignalIdentityTarget, right: SignalIdentityTarget) {
  const leftKeys = buildSignalIdentityKeys(left);
  const rightKeys = buildSignalIdentityKeys(right);
  for (const key of leftKeys) {
    if (rightKeys.has(key)) {
      return true;
    }
  }
  return false;
}

function buildSubmissionSignalIdentity(submission: Submission, projectId?: string | null): SignalIdentityTarget {
  return {
    submissionId: submission.id,
    receiptBlobId: submission.receiptBlobId,
    signalReceiptMetadataDigest: submission.signalReceiptMetadataDigest,
    projectId,
    onchainSignalId: submission.onchainSignalId,
  };
}

function buildOnchainSignalIdentity(projectId: string, signal: OnchainProjectSignalSummary): SignalIdentityTarget {
  return {
    receiptBlobId: signal.walrusBlobId,
    signalReceiptMetadataDigest: signal.metadataDigest,
    projectId,
    onchainSignalId: signal.signalId,
  };
}

function patchSubmissionFromOnchainSignal(submission: Submission, signal: OnchainProjectSignalSummary) {
  return normalizeSubmission({
    ...submission,
    receiptBlobId: submission.receiptBlobId ?? signal.walrusBlobId,
    pendingOnchainRegistration: false,
    onchainSignalId: signal.signalId,
    signalReceiptMetadataDigest: signal.metadataDigest,
    onchainStatus: signal.status,
    isEncrypted: submission.isEncrypted || signal.encrypted,
    sealIdentity: submission.sealIdentity ?? signal.sealIdentity,
    updatedAt: new Date().toISOString(),
  });
}

export function createShadowForm(
  project: ProjectSummary,
  onchainForm: OnchainProjectFormSummary | undefined,
  onchainFormId: number,
): FormWithCount {
  return {
    id: buildOnchainShadowFormId(project.objectId, onchainFormId),
    title: onchainForm?.title || `${project.name} signal stream`,
    description: "Recovered from on-chain project registry.",
    fields: [],
    sections: [],
    createdAt: onchainForm?.createdAt ?? project.createdAt ?? new Date(0).toISOString(),
    updatedAt: onchainForm?.createdAt ?? project.createdAt ?? new Date(0).toISOString(),
    ownerAddress: project.owner,
    creationMode: "admin",
    isOnchain: true,
    encryptSubmissions: true,
    projectId: project.objectId,
    projectName: project.name,
    onchainFormId,
    formMetadataDigest: onchainForm?.metadataDigest,
    registrationMode: "sui",
    submissionCount: 0,
  } satisfies FormWithCount;
}

export function mergeFormsWithProjectRegistry(
  forms: FormWithCount[],
  projects: ProjectSummary[],
  preferredProject: ProjectSummary | null,
) {
  const orderedProjects = preferredProject
    ? [preferredProject, ...projects.filter((project) => project.objectId !== preferredProject.objectId)]
    : projects;
  const mergedForms = [...forms];
  const seenFormIds = new Set(forms.map((form) => form.id));
  const seenProjectFormKeys = new Set(
    forms.map((form) => buildProjectFormKey(form.projectId, form.onchainFormId)).filter(Boolean),
  );

  orderedProjects.forEach((project) => {
    const onchainSignalCountByFormId = new Map<number, number>();
    (project.onchainSignals ?? []).forEach((signal) => {
      onchainSignalCountByFormId.set(signal.formId, (onchainSignalCountByFormId.get(signal.formId) ?? 0) + 1);
    });

    (project.onchainForms ?? []).forEach((onchainForm) => {
      const projectFormKey = buildProjectFormKey(project.objectId, onchainForm.formId);
      if (!projectFormKey || seenProjectFormKeys.has(projectFormKey)) {
        return;
      }

      const shadowForm = createShadowForm(project, onchainForm, onchainForm.formId);
      const nextForm = {
        ...shadowForm,
        submissionCount: Math.max(shadowForm.submissionCount, onchainSignalCountByFormId.get(onchainForm.formId) ?? 0),
      } satisfies FormWithCount;

      if (isDeletedFormTombstone(nextForm)) {
        return;
      }

      if (seenFormIds.has(nextForm.id)) {
        return;
      }

      mergedForms.push(nextForm);
      seenFormIds.add(nextForm.id);
      seenProjectFormKeys.add(projectFormKey);
    });
  });

  return mergedForms;
}

function mergeFormsById(primary: FormWithCount[], secondary: FormWithCount[]) {
  const formsById = new Map<string, FormWithCount>();
  const seenProjectFormKeys = new Set<string>();
  const seenProjectManifestKeys = new Set<string>();
  [...primary, ...secondary].forEach((form) => {
    if (formsById.has(form.id)) {
      return;
    }
    const projectFormKey = buildProjectFormKey(form.projectId, form.onchainFormId);
    if (projectFormKey && seenProjectFormKeys.has(projectFormKey)) {
      return;
    }
    const projectManifestKey = buildProjectManifestKey(form.projectId, form.manifestBlobId);
    if (projectManifestKey && seenProjectManifestKeys.has(projectManifestKey)) {
      return;
    }
    formsById.set(form.id, form);
    if (projectFormKey) {
      seenProjectFormKeys.add(projectFormKey);
    }
    if (projectManifestKey) {
      seenProjectManifestKeys.add(projectManifestKey);
    }
  });
  return [...formsById.values()];
}

function isOnchainRegisteredSubmission(submission: Submission) {
  return typeof submission.onchainSignalId === "number";
}

async function restoreProjectFormFromManifest(
  project: ProjectSummary,
  onchainForm: OnchainProjectFormSummary,
) {
  if (!onchainForm.manifestBlobId) {
    return null;
  }

  const carrier = await readManifestWithForm(onchainForm.manifestBlobId);
  const bundledForm = carrier.form;
  const linkedFormBlobId =
    carrier.manifest.formBlobId && carrier.manifest.formBlobId !== "__bundled_form__"
      ? carrier.manifest.formBlobId
      : undefined;
  const linkedForm = !bundledForm && linkedFormBlobId ? await fetchJsonBlob<FormSchema>(linkedFormBlobId) : null;
  const restoredForm = bundledForm ?? linkedForm;
  if (!restoredForm) {
    return null;
  }

  if (onchainForm.sourceFormId && restoredForm.id !== onchainForm.sourceFormId) {
    return null;
  }

  const formBlobId =
    onchainForm.formBlobId ??
    linkedFormBlobId ??
    (bundledForm ? onchainForm.manifestBlobId : undefined) ??
    onchainForm.manifestBlobId;
  const normalized = normalizeForm({
    ...restoredForm,
    ownerAddress: restoredForm.ownerAddress ?? project.owner,
    projectId: project.objectId,
    projectName: project.name,
    onchainFormId: onchainForm.formId,
    formMetadataDigest: onchainForm.metadataDigest || restoredForm.formMetadataDigest,
    manifestBlobId: onchainForm.manifestBlobId,
    blobId: formBlobId,
    isOnchain: true,
    registrationMode: "sui",
  });
  const persistedForm = {
    ...normalized,
    submissionCount: 0,
  } satisfies FormWithCount;

  if (isDeletedFormTombstone(persistedForm)) {
    return null;
  }

  await localStorageAdapter.saveForm(persistedForm);
  saveFormMetadataOverlay(persistedForm);
  upsertFormBlobIndex({
    formId: persistedForm.id,
    formBlobId: formBlobId ?? onchainForm.manifestBlobId,
    manifestBlobId: onchainForm.manifestBlobId,
    createdAt: persistedForm.createdAt,
  });

  return persistedForm;
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, timeoutMessage: string) {
  return Promise.race<T>([
    task,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ]);
}

async function loadRemoteIndexedSubmissions(form: FormWithCount) {
  const indexEntries = await fetchRemoteSubmissionIndex({
    formId: form.id,
    projectId: form.projectId,
  });
  if (indexEntries.length === 0) {
    return { indexEntries, submissions: [] as Submission[] };
  }
  const submissions = await Promise.all(
    indexEntries.map(async (entry) => {
      const payload = await fetchJsonBlob<unknown>(entry.answerBlobId);
      const submission = unwrapWalrusSubmissionPayload(
        payload,
        {
          signalId: Number(entry.signalId) || 0,
          formId: form.onchainFormId ?? 0,
          walrusBlobId: entry.answerBlobId,
          metadataDigest: "",
          encrypted: false,
          status: "new",
          createdAt: entry.createdAt,
        },
        form.id,
      );
      const normalized: Submission | null = submission
        ? (normalizeSubmission({
            ...submission,
            formId: form.id,
            projectId: form.projectId,
            answerBlobId: entry.answerBlobId,
            receiptBlobId: submission.receiptBlobId ?? entry.answerBlobId,
            remoteIndexTarget: getRemoteSubmissionIndexSource(),
            remoteIndexUpdated: true,
            remoteIndexReadBack: true,
            ownerReadable: true,
            remoteSyncStatus: entry.status === "remote_synced" ? "remote_synced" : "sync_pending",
          }) as Submission)
        : null;
      return normalized;
    }),
  );
  return {
    indexEntries,
    submissions: submissions.filter((submission): submission is Submission => submission !== null),
  };
}

function mapOnchainStatusToSubmissionState(status: OnchainProjectSignalSummary["status"]) {
  if (status === "archived") {
    return {
      status: "archived" as const,
      triageStatus: "closed" as const,
      priority: "medium" as const,
    };
  }
  if (status === "triaged") {
    return {
      status: "read" as const,
      triageStatus: "investigating" as const,
      priority: "medium" as const,
    };
  }
  return {
    status: "unread" as const,
    triageStatus: "new" as const,
    priority: "medium" as const,
  };
}

function unwrapWalrusSubmissionPayload(
  payload: unknown,
  fallbackSignal: OnchainProjectSignalSummary,
  formId: string,
): Submission | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (
    "kind" in payload &&
    (payload as { kind?: unknown }).kind === "submissionBundle" &&
    "submission" in payload &&
    (payload as { submission?: unknown }).submission &&
    typeof (payload as { submission?: unknown }).submission === "object"
  ) {
    return normalizeSubmission({
      ...((payload as { submission: Record<string, unknown> }).submission),
      formId,
    } as Record<string, unknown> & { id: string; formId: string; createdAt: string });
  }

  if ("id" in payload && "createdAt" in payload) {
    return normalizeSubmission({
      ...(payload as Record<string, unknown>),
      formId,
    } as Record<string, unknown> & { id: string; formId: string; createdAt: string });
  }

  const fallbackState = mapOnchainStatusToSubmissionState(fallbackSignal.status);
  return normalizeSubmission({
    id: buildOnchainShadowSignalId(formId, fallbackSignal.signalId),
    formId,
    createdAt: fallbackSignal.createdAt ?? new Date(0).toISOString(),
    updatedAt: fallbackSignal.createdAt ?? new Date(0).toISOString(),
    answers: {},
    attachments: [],
    isEncrypted: fallbackSignal.encrypted,
    status: fallbackState.status,
    triageStatus: fallbackState.triageStatus,
    priority: fallbackState.priority,
    tags: [],
    notes: "",
    receiptBlobId: fallbackSignal.walrusBlobId,
    onchainSignalId: fallbackSignal.signalId,
    signalReceiptMetadataDigest: fallbackSignal.metadataDigest,
    onchainStatus: fallbackSignal.status,
    sealIdentity: fallbackSignal.sealIdentity,
    respondentMeta: fallbackSignal.submitter
      ? {
          walletAddress: fallbackSignal.submitter,
          chain: "sui",
          submittedAt: fallbackSignal.createdAt ?? new Date(0).toISOString(),
          isAnonymous: false,
        }
      : undefined,
  });
}

function createFallbackOnchainSubmission(
  signal: OnchainProjectSignalSummary,
  formId: string,
  formTitle: string,
): Submission {
  const fallbackState = mapOnchainStatusToSubmissionState(signal.status);
  return normalizeSubmission({
    id: buildOnchainShadowSignalId(formId, signal.signalId),
    formId,
    createdAt: signal.createdAt ?? new Date(0).toISOString(),
    updatedAt: signal.createdAt ?? new Date(0).toISOString(),
    answers: {},
    attachments: [],
    isEncrypted: signal.encrypted,
    status: fallbackState.status,
    triageStatus: fallbackState.triageStatus,
    priority: fallbackState.priority,
    tags: ["onchain-recovered"],
    notes: "",
    receiptBlobId: signal.walrusBlobId,
    onchainSignalId: signal.signalId,
    signalReceiptMetadataDigest: signal.metadataDigest,
    onchainStatus: signal.status,
    sealIdentity: signal.sealIdentity,
    subjectPreview: signal.encrypted ? "Private signal" : `${formTitle} signal`,
    respondentMeta: signal.submitter
      ? {
          walletAddress: signal.submitter,
          chain: "sui",
          submittedAt: signal.createdAt ?? new Date(0).toISOString(),
          isAnonymous: false,
        }
      : undefined,
  });
}

export function matchesStream(record: SignalRecord, streamId: StreamId) {
  switch (streamId) {
    case "needs_review":
      return record.submission.status !== "archived";
    case "unresolved":
      return (
        record.submission.status !== "archived" &&
        record.submission.triageStatus !== "fixed" &&
        record.submission.triageStatus !== "closed"
      );
    case "follow_up":
      return hasNeedsFollowUp(record.submission);
    case "unread":
      return record.submission.status === "unread";
    case "verified":
      return isVerifiedSignal(record.submission);
    case "anonymous":
      return getSubmissionRespondentMeta(record.submission).isAnonymous;
    case "published":
      return (
        record.submission.triageStatus === "planned" ||
        record.submission.triageStatus === "in_progress" ||
        record.submission.triageStatus === "fixed"
      );
    case "encrypted":
      return record.submission.isEncrypted;
    case "high":
      return record.submission.priority === "high" || record.submission.severity === "high";
    case "pending_sui":
      return Boolean(record.submission.pendingOnchainRegistration);
    case "registered_sui":
      return typeof record.submission.onchainSignalId === "number";
    case "bug":
      return record.category === "Bug";
    case "feature":
      return record.category === "Feature";
    case "archived":
      return record.submission.status === "archived";
    default:
      return true;
  }
}

interface UseSignalInboxDataArgs {
  accountAddress?: string | null;
  capabilityProfile: CapabilityProfile;
  sortOrder?: SignalSortOrder;
  scopeProjectId?: string | null;
  viewScope?: SignalViewScope;
}

export function useSignalInboxData({
  accountAddress,
  capabilityProfile,
  sortOrder = "default",
  scopeProjectId = null,
  viewScope = "all",
}: UseSignalInboxDataArgs) {
  const suiClient = useSuiClient();
  const { projects, dataUpdatedAt: projectsUpdatedAt } = useProjectRegistry(accountAddress);
  const [selectedProjectId, setSelectedProjectId] = useState(() => getSelectedProjectId());
  const [hydratedSelectedProject, setHydratedSelectedProject] = useState<ProjectSummary | null>(null);
  const [selectedProjectHydrating, setSelectedProjectHydrating] = useState(false);
  const [forms, setForms] = useState<FormWithCount[]>([]);
  const [submissionsByFormId, setSubmissionsByFormId] = useState<Record<string, Submission[]>>({});
  const [supplementalSignals, setSupplementalSignals] = useState<SignalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedFormId, setSelectedFormId] = useState("all");
  const [selectedStreamId, setSelectedStreamId] = useState<StreamId>("all");
  const [selectedSignalId, setSelectedSignalId] = useState("");
  const [search, setSearch] = useState("");
  const loadConsoleRunRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const formsRef = useRef<FormWithCount[]>([]);
  const submissionsRef = useRef<Record<string, Submission[]>>({});
  const lastStableFormsRef = useRef<FormWithCount[]>([]);

  useEffect(() => {
    formsRef.current = forms;
    if (forms.length > 0) {
      lastStableFormsRef.current = forms;
    }
  }, [forms]);

  useEffect(() => {
    submissionsRef.current = submissionsByFormId;
  }, [submissionsByFormId]);

  useEffect(() => {
    return subscribeProjectRegistryStorageChange(() => {
      setSelectedProjectId(getSelectedProjectId());
    });
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setHydratedSelectedProject(null);
      setSelectedProjectHydrating(false);
      return;
    }

    let cancelled = false;
    setSelectedProjectHydrating(true);

    const refreshSelectedProject = async () => {
      try {
        const response = await suiClient.getObject({
          id: selectedProjectId,
          options: {
            showType: true,
            showContent: true,
          },
        });
        const parsed = parseSuiObjectData(response);
        if (!parsed || !isProjectObjectType(parsed.type)) {
          if (!cancelled) {
            setHydratedSelectedProject(null);
            setSelectedProjectHydrating(false);
          }
          return;
        }
        const project = parseProjectSummary(parsed.objectId, parsed.fields);
        if (!cancelled) {
          setHydratedSelectedProject(project);
          setSelectedProjectHydrating(false);
        }
      } catch {
        if (!cancelled) {
          setHydratedSelectedProject(null);
          setSelectedProjectHydrating(false);
        }
      }
    };

    void refreshSelectedProject();

    const handleFocus = () => {
      void refreshSelectedProject();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
    };
  }, [projectsUpdatedAt, selectedProjectId, suiClient]);

  async function hydrateOnchainSignals(
    nextForms: FormWithCount[],
    nextSubmissions: Record<string, Submission[]>,
    runId: number,
  ) {
    const activeProjects =
      hydratedSelectedProject
        ? [
            hydratedSelectedProject,
            ...projects.filter((project) => project.objectId !== hydratedSelectedProject.objectId),
          ]
        : projects;

    if (activeProjects.length === 0) {
      if (runId === loadConsoleRunRef.current) {
        setSupplementalSignals([]);
      }
      return;
    }

    const localFormsByOnchainKey = new Map<string, FormWithCount>();
    const localSignals: Array<{ form: FormWithCount; submission: Submission }> = [];

    nextForms.forEach((form) => {
      if (form.projectId && typeof form.onchainFormId === "number") {
        localFormsByOnchainKey.set(`${form.projectId}:${form.onchainFormId}`, form);
      }
    });

    Object.entries(nextSubmissions).forEach(([formId, submissions]) => {
      const form = nextForms.find((entry) => entry.id === formId);
      if (!form?.projectId) {
        return;
      }
      submissions.forEach((submission) => {
        localSignals.push({ form, submission });
      });
    });

    const candidates = activeProjects.flatMap((project) =>
      (project.onchainSignals ?? []).flatMap((signal) => {
        const localMatch = localSignals.find(({ form, submission }) =>
          matchesSignalIdentity(
            buildSubmissionSignalIdentity(submission, form.projectId),
            buildOnchainSignalIdentity(project.objectId, signal),
          ),
        );
        if (localMatch) {
          const previousSubmission = localMatch.submission;
          const patchedSubmission = patchSubmissionFromOnchainSignal(previousSubmission, signal);
          localMatch.submission = patchedSubmission;
          nextSubmissions[localMatch.form.id] = (nextSubmissions[localMatch.form.id] ?? []).map((submission) =>
            matchesSignalIdentity(
              buildSubmissionSignalIdentity(submission, localMatch.form.projectId),
              buildSubmissionSignalIdentity(previousSubmission, localMatch.form.projectId),
            )
              ? patchedSubmission
              : submission,
          );
          setSubmissionsByFormId((current) => ({
            ...current,
            [localMatch.form.id]: (current[localMatch.form.id] ?? []).map((submission) =>
              matchesSignalIdentity(
                buildSubmissionSignalIdentity(submission, localMatch.form.projectId),
                buildSubmissionSignalIdentity(previousSubmission, localMatch.form.projectId),
              )
                ? patchedSubmission
                : submission,
            ),
          }));
          return [];
        }
        return [{ project, signal }];
      }),
    );

    if (candidates.length === 0) {
      if (runId === loadConsoleRunRef.current) {
        setSupplementalSignals([]);
      }
      return;
    }

    const hydratedRecords: SignalRecord[] = [];

    for (let index = 0; index < candidates.length; index += ONCHAIN_SIGNAL_BATCH_SIZE) {
      const batch = candidates.slice(index, index + ONCHAIN_SIGNAL_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async ({ project, signal }) => {
          const onchainForm = (project.onchainForms ?? []).find((entry) => entry.formId === signal.formId);
          const localForm =
            localFormsByOnchainKey.get(`${project.objectId}:${signal.formId}`) ?? null;
          const form = localForm ?? createShadowForm(project, onchainForm, signal.formId);
          const fallbackSubmission = createFallbackOnchainSubmission(signal, form.id, form.title);

          try {
            const payload = await fetchJsonBlob<unknown>(signal.walrusBlobId);
            const hydratedSubmission =
              unwrapWalrusSubmissionPayload(payload, signal, form.id) ?? fallbackSubmission;
            const submission = normalizeSubmission({
              ...hydratedSubmission,
              formId: form.id,
              receiptBlobId: hydratedSubmission.receiptBlobId ?? signal.walrusBlobId,
              onchainSignalId: signal.signalId,
              signalReceiptMetadataDigest:
                hydratedSubmission.signalReceiptMetadataDigest ?? signal.metadataDigest,
              onchainStatus: signal.status,
              isEncrypted: signal.encrypted || hydratedSubmission.isEncrypted,
              sealIdentity: hydratedSubmission.sealIdentity ?? signal.sealIdentity,
              updatedAt: hydratedSubmission.updatedAt ?? hydratedSubmission.createdAt,
            });
            return {
              form: { ...form, submissionCount: Math.max(form.submissionCount, 1) },
              submission,
            };
          } catch (error) {
            console.warn(`Failed to hydrate on-chain signal ${signal.signalId} from Walrus`, error);
            return {
              form: { ...form, submissionCount: Math.max(form.submissionCount, 1) },
              submission: fallbackSubmission,
            };
          }
        }),
      );

      if (runId !== loadConsoleRunRef.current) {
        return;
      }

      batchResults.forEach(({ form, submission }) => {
        const category = inferSignalCategory(submission);
        hydratedRecords.push({
          form,
          submission,
          category,
          searchText: buildLightweightSearchText(form, submission, category),
        });
      });
    }

    if (runId === loadConsoleRunRef.current) {
      setSupplementalSignals(hydratedRecords);
    }
  }

  function patchLocalOnchainSignals(
    nextForms: FormWithCount[],
    nextSubmissions: Record<string, Submission[]>,
    runId: number,
  ) {
    const activeProjects =
      hydratedSelectedProject
        ? [
            hydratedSelectedProject,
            ...projects.filter((project) => project.objectId !== hydratedSelectedProject.objectId),
          ]
        : projects;

    if (activeProjects.length === 0 || runId !== loadConsoleRunRef.current) {
      return;
    }

    const localSignals: Array<{ form: FormWithCount; submission: Submission }> = [];
    Object.entries(nextSubmissions).forEach(([formId, submissions]) => {
      const form = nextForms.find((entry) => entry.id === formId);
      if (!form?.projectId) {
        return;
      }
      submissions.forEach((submission) => {
        localSignals.push({ form, submission });
      });
    });

    activeProjects.forEach((project) => {
      (project.onchainSignals ?? []).forEach((signal) => {
        const localMatch = localSignals.find(({ form, submission }) =>
          matchesSignalIdentity(
            buildSubmissionSignalIdentity(submission, form.projectId),
            buildOnchainSignalIdentity(project.objectId, signal),
          ),
        );
        if (!localMatch) {
          return;
        }

        const previousSubmission = localMatch.submission;
        const patchedSubmission = patchSubmissionFromOnchainSignal(previousSubmission, signal);
        localMatch.submission = patchedSubmission;
        nextSubmissions[localMatch.form.id] = (nextSubmissions[localMatch.form.id] ?? []).map((submission) =>
          matchesSignalIdentity(
            buildSubmissionSignalIdentity(submission, localMatch.form.projectId),
            buildSubmissionSignalIdentity(previousSubmission, localMatch.form.projectId),
          )
            ? patchedSubmission
            : submission,
        );
        setSubmissionsByFormId((current) => ({
          ...current,
          [localMatch.form.id]: (current[localMatch.form.id] ?? []).map((submission) =>
            matchesSignalIdentity(
              buildSubmissionSignalIdentity(submission, localMatch.form.projectId),
              buildSubmissionSignalIdentity(previousSubmission, localMatch.form.projectId),
            )
              ? patchedSubmission
              : submission,
          ),
        }));
      });
    });
  }

  async function loadConsole(preferredSignalId?: string) {
    if (selectedProjectId && selectedProjectHydrating) {
      setLoading(true);
      setLoadError("");
      return;
    }
    const runId = loadConsoleRunRef.current + 1;
    loadConsoleRunRef.current = runId;
    startPerf("admin:load-console");
    startPerf("admin:local-shell");
    setLoading(!hasLoadedOnceRef.current);
    setSubmissionsLoading(false);
    setLoadError("");
    try {
      const initialForms = await measurePerf("admin:local-forms", () => storageAdapter.listForms());
      if (runId !== loadConsoleRunRef.current) {
        return;
      }

      const normalizedInitialForms = initialForms
        .map((form) => ({ ...normalizeForm(form), submissionCount: 0 }))
        .filter((form) => !isDeletedFormTombstone(form));
      const nextForms = mergeFormsWithProjectRegistry(normalizedInitialForms, projects, hydratedSelectedProject).filter(
        (form) => !isDeletedFormTombstone(form),
      );
      const effectiveForms =
        nextForms.length === 0 && lastStableFormsRef.current.length > 0
          ? lastStableFormsRef.current
          : nextForms;
      if (nextForms.length === 0 && lastStableFormsRef.current.length > 0) {
        console.warn("DeepSignal preserved the previous node list because the latest refresh returned zero forms.");
      }
      setForms(effectiveForms);
      setSelectedSignalId((current) => preferredSignalId ?? current);
      hasLoadedOnceRef.current = true;
      setLoading(false);
      endPerf("admin:local-shell", "ok", `${effectiveForms.length} forms`);

      scheduleInboxBackgroundTask(() => {
        void measurePerf("admin:manifest-restore", async () => {
          const restoredForms: FormWithCount[] = [];
          const knownProjectFormKeys = new Set(
            normalizedInitialForms
              .map((form) => buildProjectFormKey(form.projectId, form.onchainFormId))
              .filter(Boolean),
          );
          const orderedProjects = hydratedSelectedProject
            ? [hydratedSelectedProject, ...projects.filter((project) => project.objectId !== hydratedSelectedProject.objectId)]
            : projects;

          for (const project of orderedProjects) {
            for (const onchainForm of project.onchainForms ?? []) {
              const projectFormKey = buildProjectFormKey(project.objectId, onchainForm.formId);
              if (!projectFormKey || knownProjectFormKeys.has(projectFormKey) || !onchainForm.manifestBlobId) {
                continue;
              }

              try {
                const restoredForm = await withTimeout(
                  restoreProjectFormFromManifest(project, onchainForm),
                  MANIFEST_RESTORE_TIMEOUT_MS,
                  `Manifest restore timed out for ${project.objectId}:${onchainForm.formId}.`,
                );
                if (!restoredForm) {
                  continue;
                }
                restoredForms.push(restoredForm);
                knownProjectFormKeys.add(projectFormKey);
              } catch (error) {
                console.warn(`Failed to restore project form ${project.objectId}:${onchainForm.formId} from Walrus`, error);
              }
            }
          }

          if (runId !== loadConsoleRunRef.current || restoredForms.length === 0) {
            return;
          }

          setForms((current) =>
            mergeFormsWithProjectRegistry(
              mergeFormsById(restoredForms, current).map((form) => ({
                ...form,
                submissionCount: form.submissionCount ?? 0,
              })),
              projects,
              hydratedSelectedProject,
            ).filter((form) => !isDeletedFormTombstone(form)),
          );
        });
      });

      const nextAccessibleForms = effectiveForms.filter((form) => canReviewForm(form, accountAddress, capabilityProfile));

      if (nextAccessibleForms.length === 0) {
        writeOwnerSubmissionIndexFetchLog({
          event: "owner_submission_index_fetch",
          viewerRole: getViewerRole(capabilityProfile, accountAddress),
          selectedProjectId: selectedProjectId || null,
          remoteIndexSource: projects.some((project) => (project.onchainSignals ?? []).length > 0)
            ? "sui.projectRegistry"
            : "none",
          remoteIndexEntryCount: 0,
          answerBlobFetchCount: 0,
          visibleSubmissionCount: 0,
          localFallbackCount: 0,
          filteredOutCount: effectiveForms.length,
          filterReasons: { access_denied: effectiveForms.length },
          walletConnectedState: accountAddress ? "connected" : "disconnected",
        });
        scheduleInboxBackgroundTask(() => {
          void measurePerf("admin:onchain-hydration", () => hydrateOnchainSignals(effectiveForms, {}, runId));
        });
        endPerf("admin:load-console", "ok");
        return;
      }

      setSubmissionsLoading(true);
      const nextSubmissions: Record<string, Submission[]> = {};
      startPerf("admin:submissions");

      for (let index = 0; index < nextAccessibleForms.length; index += ADMIN_SUBMISSION_BATCH_SIZE) {
        const formBatch = nextAccessibleForms.slice(index, index + ADMIN_SUBMISSION_BATCH_SIZE);
        const batchResults = await Promise.all(
          formBatch.map(async (form) => {
            try {
              const [raw, remoteIndexed] = await Promise.all([
                storageAdapter.listSubmissions(form.id),
                loadRemoteIndexedSubmissions(form).catch((error) => {
                  console.warn(`Failed to load remote submission index for form ${form.id}`, error);
                  return { indexEntries: [], submissions: [] as Submission[] };
                }),
              ]);
              const normalizedLocal: Submission[] = raw.map((submission) => normalizeSubmission(submission) as Submission);
              const merged: Submission[] = [...normalizedLocal];
              remoteIndexed.submissions.forEach((remoteSubmission) => {
                const existingIndex = merged.findIndex((submission) =>
                  matchesSignalIdentity(
                    buildSubmissionSignalIdentity(submission, form.projectId),
                    buildSubmissionSignalIdentity(remoteSubmission, form.projectId),
                  ),
                );
                if (existingIndex === -1) {
                  merged.push(remoteSubmission);
                  return;
                }
                merged[existingIndex] = {
                  ...merged[existingIndex],
                  ...remoteSubmission,
                  answers:
                    Object.keys(remoteSubmission.answers).length > 0
                      ? remoteSubmission.answers
                      : merged[existingIndex].answers,
                };
              });
              return {
                formId: form.id,
                remoteIndexEntryCount: remoteIndexed.indexEntries.length,
                submissions: merged,
              };
            } catch (error) {
              console.error(`Failed to load submissions for form ${form.id}`, error);
              return {
                formId: form.id,
                remoteIndexEntryCount: 0,
                submissions: [] as Submission[],
              };
            }
          }),
        );

        if (runId !== loadConsoleRunRef.current) {
          return;
        }

        batchResults.forEach((result) => {
          nextSubmissions[result.formId] = result.submissions;
        });

        setSubmissionsByFormId((current) => ({
          ...current,
          ...Object.fromEntries(batchResults.map((result) => [result.formId, result.submissions])),
        }));
        setForms((current) =>
          current.map((form) => {
            const loaded = nextSubmissions[form.id];
            return loaded
              ? { ...form, submissionCount: loaded.length }
              : form;
          }),
        );
      }
      endPerf("admin:submissions", "ok");

      const loadedSubmissions = Object.values(nextSubmissions).flat();
      const remoteIndexEntryCount = Object.values(nextSubmissions).reduce(
        (count, submissions) => count + submissions.filter((submission) => submission.remoteIndexUpdated).length,
        0,
      );
      const localFallbackCount = loadedSubmissions.filter((submission) =>
        isLocalFallbackBlob(submission.answerBlobId ?? submission.receiptBlobId ?? submission.blobId),
      ).length;
      const remoteIndexedCount = remoteIndexEntryCount;
      writeOwnerSubmissionIndexFetchLog({
        event: "owner_submission_index_fetch",
        viewerRole: getViewerRole(capabilityProfile, accountAddress),
        selectedProjectId: selectedProjectId || null,
        remoteIndexSource:
          remoteIndexedCount > 0
            ? "submission.remoteIndex"
            : projects.some((project) => (project.onchainSignals ?? []).length > 0)
              ? "sui.projectRegistry"
              : "local-cache",
        remoteIndexEntryCount: remoteIndexedCount,
        answerBlobFetchCount: loadedSubmissions.filter((submission) => submission.answerBlobId || submission.receiptBlobId || submission.blobId).length,
        visibleSubmissionCount: loadedSubmissions.length,
        localFallbackCount,
        filteredOutCount: effectiveForms.length - nextAccessibleForms.length,
        filterReasons: {
          access_denied: effectiveForms.length - nextAccessibleForms.length,
          local_only: localFallbackCount,
        },
        walletConnectedState: accountAddress ? "connected" : "disconnected",
      });

      patchLocalOnchainSignals(effectiveForms, nextSubmissions, runId);
      scheduleInboxBackgroundTask(() => {
        void measurePerf("admin:onchain-hydration", () => hydrateOnchainSignals(effectiveForms, nextSubmissions, runId));
      });
      endPerf("admin:load-console", "ok");
    } catch (error) {
      console.error("Failed to load admin console", error);
      if (formsRef.current.length === 0) {
        setForms([]);
      }
      if (Object.keys(submissionsRef.current).length === 0) {
        setSubmissionsByFormId({});
      }
      if (formsRef.current.length === 0) {
        setSupplementalSignals([]);
      }
      setLoadError(
        error instanceof Error
          ? `Failed to load Research Lab: ${error.message}`
          : "Failed to load Research Lab.",
      );
      endPerf("admin:load-console", "failed", error instanceof Error ? error.message : String(error));
    } finally {
      if (runId === loadConsoleRunRef.current) {
        setSubmissionsLoading(false);
      }
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConsole();
    // loadConsole intentionally owns a fresh run id and reads the latest scoped state on refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    accountAddress,
    capabilityProfile.hasOwnerCap,
    capabilityProfile.hasAdminCap,
    capabilityProfile.hasReviewerCap,
    capabilityProfile.isConfigured,
    hydratedSelectedProject?.objectId,
    projectsUpdatedAt,
    selectedProjectHydrating,
  ]);

  const accessibleForms = useMemo(
    () =>
      forms.filter((form) => canReviewForm(form, accountAddress, capabilityProfile)),
    [accountAddress, capabilityProfile, forms],
  );
  const isProjectScoped = viewScope === "project" && Boolean(scopeProjectId);
  const scopedAccessibleForms = useMemo(
    () =>
      isProjectScoped && scopeProjectId
        ? accessibleForms.filter((form) => form.projectId === scopeProjectId)
        : accessibleForms,
    [accessibleForms, isProjectScoped, scopeProjectId],
  );

  useEffect(() => {
    if (selectedFormId === "all") {
      return;
    }
    if (!scopedAccessibleForms.some((form) => form.id === selectedFormId)) {
      setSelectedFormId("all");
    }
  }, [scopedAccessibleForms, selectedFormId]);

  const fullSignalIndex = useMemo(() => {
    const signals: SignalRecord[] = [];
    const signalById: Record<string, SignalRecord | undefined> = {};
    const counts = {
      needsReview: 0,
      followUp: 0,
      unresolved: 0,
      unread: 0,
      verified: 0,
      anonymous: 0,
      published: 0,
      encrypted: 0,
      high: 0,
      pendingSui: 0,
      registeredSui: 0,
      archived: 0,
    };
    const unreadCountByFormId: Record<string, number> = {};
    const pendingSignalIdSet = new Set<string>();
    const appendedSignals: Array<{ form: FormWithCount; submission: Submission }> = [];

    function appendRecord(record: SignalRecord) {
      signals.push(record);
      signalById[record.submission.id] = record;
      appendedSignals.push({ form: record.form, submission: record.submission });

      if (record.submission.status === "unread") {
        unreadCountByFormId[record.form.id] = (unreadCountByFormId[record.form.id] ?? 0) + 1;
        counts.unread += 1;
      }
      if (
        record.submission.status !== "archived" &&
        record.submission.triageStatus !== "fixed" &&
        record.submission.triageStatus !== "closed"
      ) {
        counts.unresolved += 1;
      }
      if (isVerifiedSignal(record.submission)) {
        counts.verified += 1;
      }
      if (getSubmissionRespondentMeta(record.submission).isAnonymous) {
        counts.anonymous += 1;
      }
      if (record.submission.status !== "archived") {
        counts.needsReview += 1;
      }
      if (
        record.submission.triageStatus === "planned" ||
        record.submission.triageStatus === "in_progress" ||
        record.submission.triageStatus === "fixed"
      ) {
        counts.published += 1;
      }
      if (record.submission.isEncrypted) {
        counts.encrypted += 1;
      }
      if (record.submission.priority === "high" || record.submission.severity === "high") {
        counts.high += 1;
      }
      if (hasNeedsFollowUp(record.submission)) {
        counts.followUp += 1;
      }
      if (record.submission.pendingOnchainRegistration) {
        counts.pendingSui += 1;
        pendingSignalIdSet.add(record.submission.id);
      }
      if (typeof record.submission.onchainSignalId === "number") {
        counts.registeredSui += 1;
      }
      if (record.submission.status === "archived") {
        counts.archived += 1;
      }
    }

    for (const form of accessibleForms) {
      unreadCountByFormId[form.id] = unreadCountByFormId[form.id] ?? 0;
      const submissions = submissionsByFormId[form.id] ?? [];

      for (const submission of submissions) {
        const registeredSupplementalSignal = supplementalSignals.find(
          (record) =>
            isOnchainRegisteredSubmission(record.submission) &&
            matchesSignalIdentity(
              buildSubmissionSignalIdentity(submission, form.projectId),
              buildSubmissionSignalIdentity(record.submission, record.form.projectId),
            ),
        );
        if (registeredSupplementalSignal && !isOnchainRegisteredSubmission(submission)) {
          continue;
        }
        const category = inferSignalCategory(submission);
        const record = {
          form,
          submission,
          category,
          searchText: buildLightweightSearchText(form, submission, category),
        } satisfies SignalRecord;

        appendRecord(record);
      }
    }

    for (const record of supplementalSignals) {
      const duplicateLocalSignal = appendedSignals.find(({ form, submission }) =>
        matchesSignalIdentity(
          buildSubmissionSignalIdentity(submission, form.projectId),
          buildSubmissionSignalIdentity(record.submission, record.form.projectId),
        ),
      );
      if (duplicateLocalSignal && isOnchainRegisteredSubmission(duplicateLocalSignal.submission)) {
        continue;
      }
      appendRecord(record);
    }

    return {
      signals,
      signalById,
      counts,
      unreadCountByFormId,
      pendingSignalIdSet,
    };
  }, [accessibleForms, submissionsByFormId, supplementalSignals]);
  const signalIndex = useMemo(() => {
    if (!isProjectScoped || !scopeProjectId) {
      return fullSignalIndex;
    }

    const signals = fullSignalIndex.signals.filter((record) => record.form.projectId === scopeProjectId);
    const signalById: Record<string, SignalRecord | undefined> = {};
    const counts = {
      needsReview: 0,
      followUp: 0,
      unresolved: 0,
      unread: 0,
      verified: 0,
      anonymous: 0,
      published: 0,
      encrypted: 0,
      high: 0,
      pendingSui: 0,
      registeredSui: 0,
      archived: 0,
    };
    const unreadCountByFormId: Record<string, number> = {};
    const pendingSignalIdSet = new Set<string>();

    scopedAccessibleForms.forEach((form) => {
      unreadCountByFormId[form.id] = 0;
    });

    signals.forEach((record) => {
      signalById[record.submission.id] = record;
      if (record.submission.status === "unread") {
        unreadCountByFormId[record.form.id] = (unreadCountByFormId[record.form.id] ?? 0) + 1;
        counts.unread += 1;
      }
      if (
        record.submission.status !== "archived" &&
        record.submission.triageStatus !== "fixed" &&
        record.submission.triageStatus !== "closed"
      ) {
        counts.unresolved += 1;
      }
      if (isVerifiedSignal(record.submission)) {
        counts.verified += 1;
      }
      if (getSubmissionRespondentMeta(record.submission).isAnonymous) {
        counts.anonymous += 1;
      }
      if (record.submission.status !== "archived") {
        counts.needsReview += 1;
      }
      if (
        record.submission.triageStatus === "planned" ||
        record.submission.triageStatus === "in_progress" ||
        record.submission.triageStatus === "fixed"
      ) {
        counts.published += 1;
      }
      if (record.submission.isEncrypted) {
        counts.encrypted += 1;
      }
      if (record.submission.priority === "high" || record.submission.severity === "high") {
        counts.high += 1;
      }
      if (hasNeedsFollowUp(record.submission)) {
        counts.followUp += 1;
      }
      if (record.submission.pendingOnchainRegistration) {
        counts.pendingSui += 1;
        pendingSignalIdSet.add(record.submission.id);
      }
      if (typeof record.submission.onchainSignalId === "number") {
        counts.registeredSui += 1;
      }
      if (record.submission.status === "archived") {
        counts.archived += 1;
      }
    });

    return {
      signals,
      signalById,
      counts,
      unreadCountByFormId,
      pendingSignalIdSet,
    };
  }, [fullSignalIndex, isProjectScoped, scopeProjectId, scopedAccessibleForms]);

  const allSignals = signalIndex.signals;
  const pendingSignals = useMemo(
    () => allSignals.filter((record) => record.submission.pendingOnchainRegistration),
    [allSignals],
  );
  const visibleSignals = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filteredSignals = allSignals.filter((record) => {
      if (selectedFormId !== "all" && record.form.id !== selectedFormId) {
        return false;
      }
      if (!matchesStream(record, selectedStreamId)) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      return matchesDeepSearch(record, normalizedSearch);
    });

    if (sortOrder === "default") {
      return filteredSignals;
    }

    const priorityRank: Record<Submission["priority"], number> = {
      high: 0,
      medium: 1,
      low: 2,
    };

    return [...filteredSignals].sort((left, right) => {
      if (sortOrder === "newest") {
        return Date.parse(right.submission.createdAt) - Date.parse(left.submission.createdAt);
      }
      if (sortOrder === "oldest") {
        return Date.parse(left.submission.createdAt) - Date.parse(right.submission.createdAt);
      }
      if (sortOrder === "priority") {
        const priorityDelta = priorityRank[left.submission.priority] - priorityRank[right.submission.priority];
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        if (left.submission.status !== right.submission.status) {
          return left.submission.status === "unread" ? -1 : 1;
        }
        return Date.parse(right.submission.createdAt) - Date.parse(left.submission.createdAt);
      }
      if (left.submission.status !== right.submission.status) {
        return left.submission.status === "unread" ? -1 : 1;
      }
      const triageDelta =
        (left.submission.triageStatus === "new" ? 0 : 1) - (right.submission.triageStatus === "new" ? 0 : 1);
      if (triageDelta !== 0) {
        return triageDelta;
      }
      return Date.parse(right.submission.createdAt) - Date.parse(left.submission.createdAt);
    });
  }, [allSignals, search, selectedFormId, selectedStreamId, sortOrder]);

  const selectedRecord = selectedSignalId
    ? visibleSignals.find((record) => record.submission.id === selectedSignalId) ??
      signalIndex.signalById[selectedSignalId] ??
      null
    : null;

  function applySubmissionUpdate(nextSubmission: Submission) {
    const nextForm = forms.find((form) => form.id === nextSubmission.formId);
    setSubmissionsByFormId((current) => ({
      ...current,
      [nextSubmission.formId]: (current[nextSubmission.formId] ?? []).map((submission) => {
        const matchesCanonicalSignal = matchesSignalIdentity(
          buildSubmissionSignalIdentity(submission, nextForm?.projectId),
          buildSubmissionSignalIdentity(nextSubmission, nextForm?.projectId),
        );
        return matchesCanonicalSignal ? nextSubmission : submission;
      }),
    }));
  }

  function applyFormUpdate(nextForm: FormWithCount) {
    setForms((current) => {
      const hasMatch = current.some((form) => form.id === nextForm.id);
      if (!hasMatch) {
        return [nextForm, ...current];
      }
      return current.map((form) => (form.id === nextForm.id ? mergeFormUpdate(form, nextForm) : form));
    });
  }

  function applyFormRemovals(formIds: string[]) {
    const removedIdSet = new Set(formIds.filter(Boolean));
    if (removedIdSet.size === 0) {
      return;
    }
    setForms((current) => current.filter((form) => !removedIdSet.has(form.id)));
    setSubmissionsByFormId((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([formId]) => !removedIdSet.has(formId)),
      ),
    );
    setSupplementalSignals((current) =>
      current.filter((record) => !removedIdSet.has(record.form.id)),
    );
    lastStableFormsRef.current = lastStableFormsRef.current.filter((form) => !removedIdSet.has(form.id));
    formsRef.current = formsRef.current.filter((form) => !removedIdSet.has(form.id));
    submissionsRef.current = Object.fromEntries(
      Object.entries(submissionsRef.current).filter(([formId]) => !removedIdSet.has(formId)),
    );
    setSelectedFormId((current) => (current !== "all" && removedIdSet.has(current) ? "all" : current));
    setSelectedSignalId((current) => {
      if (!current) {
        return current;
      }
      const matchingRecord = signalIndex.signalById[current];
      return matchingRecord && removedIdSet.has(matchingRecord.form.id) ? "" : current;
    });
  }

  return {
    forms,
    setForms,
    submissionsByFormId,
    setSubmissionsByFormId,
    loading,
    submissionsLoading,
    loadError,
    selectedFormId,
    setSelectedFormId,
    selectedStreamId,
    setSelectedStreamId,
    selectedSignalId,
    setSelectedSignalId,
    search,
    setSearch,
    loadConsole,
    accessibleForms: scopedAccessibleForms,
    signalIndex,
    allSignals,
    pendingSignals,
    visibleSignals,
    selectedRecord,
    applyFormUpdate,
    applyFormRemovals,
    applySubmissionUpdate,
  };
}
