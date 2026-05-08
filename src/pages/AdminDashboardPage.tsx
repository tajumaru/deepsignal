import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { AccessOverviewCard } from "../components/AccessOverviewCard";
import { BlobLink } from "../components/BlobLink";
import { EmptyState } from "../components/EmptyState";
import { SealStatusCard } from "../components/SealStatusCard";
import { ShareCard } from "../components/ShareCard";
import { getSealRuntimeStatus } from "../crypto/cryptoFactory";
import { useAccessControl } from "../hooks/useAccessControl";
import { useI18n } from "../i18n";
import {
  canAdmin,
  canReviewForm,
  getAdminSurfaceAccessState,
  getRoleLabel,
} from "../lib/adminAccess";
import { exportSubmissionJson } from "../lib/export";
import {
  getSignalPreview,
  getSignalSubject,
  getStorageBadgeLabel,
  getWalletAccessLabel,
  inferSignalCategory,
  isLocalFallbackBlob,
  type SignalCategory,
} from "../lib/signalInbox";
import {
  normalizeSubmission,
  resolveSubmissionAnswers,
  storageAdapter,
} from "../lib/storage";
import {
  shortAddress,
} from "../lib/sui";
import { formatDate, flattenAnswer } from "../lib/utils";
import { getStorageRuntimeStatus } from "../storage/storageFactory";
import type { FormSchema, Submission } from "../types";

interface FormWithCount extends FormSchema {
  submissionCount: number;
}

type StreamId =
  | "all"
  | "unread"
  | "encrypted"
  | "high"
  | "bug"
  | "feature"
  | "archived";

interface SignalRecord {
  form: FormWithCount;
  submission: Submission;
  category: SignalCategory;
}

function matchesStream(record: SignalRecord, streamId: StreamId) {
  switch (streamId) {
    case "unread":
      return record.submission.status === "unread";
    case "encrypted":
      return record.submission.isEncrypted;
    case "high":
      return record.submission.priority === "high";
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

export function AdminDashboardPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const {
    capabilityProfile,
    isPending: isLoadingCapabilities,
    isLoadingAccess,
  } = useAccessControl(account?.address);
  const sealRuntime = getSealRuntimeStatus();
  const storageRuntime = getStorageRuntimeStatus();
  const [forms, setForms] = useState<FormWithCount[]>([]);
  const [submissionsByFormId, setSubmissionsByFormId] = useState<Record<string, Submission[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedFormId, setSelectedFormId] = useState("all");
  const [selectedStreamId, setSelectedStreamId] = useState<StreamId>("all");
  const [selectedSignalId, setSelectedSignalId] = useState("");
  const [search, setSearch] = useState("");
  const [detailAnswers, setDetailAnswers] = useState<Record<string, unknown> | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<Submission["attachments"]>([]);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [draftTag, setDraftTag] = useState("");
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showEncryptedSignal, setShowEncryptedSignal] = useState(false);
  const [nodeDirectoryOpen, setNodeDirectoryOpen] = useState(false);
  const [beaconFormId, setBeaconFormId] = useState<string | null>(null);
  const [nodeSearch, setNodeSearch] = useState("");
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const saveQueueRef = useRef(Promise.resolve());
  const hasAdminAccess = canAdmin(capabilityProfile);
  const accessState = getAdminSurfaceAccessState(
    "reviewer",
    account?.address,
    capabilityProfile,
  );

  useEffect(() => {
    void loadConsole();
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function loadConsole(preferredSignalId?: string) {
    const allForms = await storageAdapter.listForms();
    const pairs = await Promise.all(
      allForms.map(async (form) => {
        const raw = await storageAdapter.listSubmissions(form.id);
        const submissions = raw.map((submission) => normalizeSubmission(submission));
        return {
          form: { ...form, submissionCount: submissions.length },
          submissions,
        };
      }),
    );

    const nextForms = pairs.map((pair) => pair.form);
    const nextSubmissions = Object.fromEntries(
      pairs.map((pair) => [pair.form.id, pair.submissions]),
    ) as Record<string, Submission[]>;

    setForms(nextForms);
    setSubmissionsByFormId(nextSubmissions);
    setSelectedSignalId((current) => preferredSignalId ?? current);
    setLoading(false);
  }

  async function handleDelete(formId: string) {
    if (!window.confirm(t("deleteFormConfirm"))) {
      return;
    }
    setDeletingFormId(formId);
    await storageAdapter.deleteForm(formId);
    await loadConsole();
    setDeletingFormId(null);
  }

  useEffect(() => {
    if (!nodeDirectoryOpen && !beaconFormId) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (beaconFormId) {
          setBeaconFormId(null);
          return;
        }
        setNodeDirectoryOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [beaconFormId, nodeDirectoryOpen]);

  const accessibleForms = useMemo(
    () =>
      forms.filter((form) => canReviewForm(form, account?.address, capabilityProfile)),
    [account?.address, capabilityProfile, forms],
  );

  useEffect(() => {
    if (selectedFormId === "all") {
      return;
    }
    if (!accessibleForms.some((form) => form.id === selectedFormId)) {
      setSelectedFormId("all");
    }
  }, [accessibleForms, selectedFormId]);

  const allSignals = useMemo<SignalRecord[]>(
    () =>
      accessibleForms.flatMap((form) =>
        (submissionsByFormId[form.id] ?? []).map((submission) => ({
          form,
          submission,
          category: inferSignalCategory(submission),
        })),
      ),
    [accessibleForms, submissionsByFormId],
  );

  const visibleSignals = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return allSignals.filter((record) => {
      if (selectedFormId !== "all" && record.form.id !== selectedFormId) {
        return false;
      }
      if (!matchesStream(record, selectedStreamId)) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      const searchBody = [
        record.form.title,
        getSignalSubject(record.submission),
        getSignalPreview(record.submission),
        flattenAnswer(record.submission.answers),
        record.submission.tags.join(" "),
        record.category,
      ]
        .join(" ")
        .toLowerCase();
      return searchBody.includes(normalizedSearch);
    });
  }, [allSignals, search, selectedFormId, selectedStreamId]);

  const selectedRecord =
    visibleSignals.find((record) => record.submission.id === selectedSignalId) ??
    allSignals.find((record) => record.submission.id === selectedSignalId) ??
    visibleSignals[0] ??
    null;

  useEffect(() => {
    if (!selectedRecord) {
      setDetailAnswers(null);
      setDetailAttachments([]);
      setNotesDraft("");
      setDecryptError("");
      return;
    }
    setNotesDraft(selectedRecord.submission.notes);
    setDetailAnswers(
      selectedRecord.submission.isEncrypted ? null : selectedRecord.submission.answers,
    );
    setDetailAttachments(selectedRecord.submission.attachments ?? []);
    setDecryptError("");
  }, [selectedRecord]);

  function applySubmissionUpdate(nextSubmission: Submission) {
    setSubmissionsByFormId((current) => ({
      ...current,
      [nextSubmission.formId]: (current[nextSubmission.formId] ?? []).map((submission) =>
        submission.id === nextSubmission.id ? nextSubmission : submission,
      ),
    }));
  }

  async function updateSubmission(nextSubmission: Submission) {
    applySubmissionUpdate(nextSubmission);
    setSelectedSignalId(nextSubmission.id);
    const runSave = async () => {
      setSaving(true);
      try {
        await storageAdapter.updateSubmission(nextSubmission);
      } finally {
        setSaving(false);
      }
    };
    saveQueueRef.current = saveQueueRef.current.then(runSave, runSave);
    await saveQueueRef.current;
  }

  async function handleSelect(record: SignalRecord) {
    setSelectedSignalId(record.submission.id);
    if (record.submission.status === "unread") {
      await updateSubmission({ ...record.submission, status: "read" });
    }
  }

  async function handleDecrypt() {
    if (!selectedRecord) {
      return;
    }
    setDecrypting(true);
    setDecryptError("");
    try {
      const resolved = await resolveSubmissionAnswers(
        selectedRecord.form,
        selectedRecord.submission,
      );
      if (resolved) {
        setDetailAnswers(resolved.answers);
        setDetailAttachments(resolved.attachments);
      }
    } catch (error) {
      setDecryptError(error instanceof Error ? error.message : t("decryptFailed"));
    } finally {
      setDecrypting(false);
    }
  }

  const streamItems = [
    { id: "all", label: t("allSignals"), count: allSignals.length },
    {
      id: "unread",
      label: t("unreadSignals"),
      count: allSignals.filter((record) => record.submission.status === "unread").length,
    },
    {
      id: "encrypted",
      label: t("encryptedSignals"),
      count: allSignals.filter((record) => record.submission.isEncrypted).length,
    },
    {
      id: "high",
      label: t("highPrioritySignals"),
      count: allSignals.filter((record) => record.submission.priority === "high").length,
    },
    {
      id: "bug",
      label: t("bugReports"),
      count: allSignals.filter((record) => record.category === "Bug").length,
    },
    {
      id: "feature",
      label: t("featureRequests"),
      count: allSignals.filter((record) => record.category === "Feature").length,
    },
    {
      id: "archived",
      label: t("archivedSignals"),
      count: allSignals.filter((record) => record.submission.status === "archived").length,
    },
  ] satisfies Array<{ id: StreamId; label: string; count: number }>;

  const unreadCountByFormId = useMemo(
    () =>
      Object.fromEntries(
        accessibleForms.map((form) => [
          form.id,
          (submissionsByFormId[form.id] ?? []).filter((submission) => submission.status === "unread")
            .length,
        ]),
      ) as Record<string, number>,
    [accessibleForms, submissionsByFormId],
  );

  const selectedForm = accessibleForms.find((form) => form.id === selectedFormId) ?? null;
  const selectedBeaconForm =
    accessibleForms.find((form) => form.id === beaconFormId) ?? null;

  const nodeDirectoryItems = useMemo(() => {
    const normalizedSearch = nodeSearch.trim().toLowerCase();
    const allFormsItem = {
      id: "all",
      title: t("allSignalNodes"),
      submissionCount: allSignals.length,
      unreadCount: allSignals.filter((record) => record.submission.status === "unread").length,
      isLegacyDemo: false,
    };
    const formItems = accessibleForms
      .filter((form) => {
        if (!normalizedSearch) {
          return true;
        }
        return (
          form.title.toLowerCase().includes(normalizedSearch) ||
          form.description.toLowerCase().includes(normalizedSearch)
        );
      })
      .map((form) => ({
        id: form.id,
        title: form.title,
        submissionCount: form.submissionCount,
        unreadCount: unreadCountByFormId[form.id] ?? 0,
        isLegacyDemo: !form.ownerAddress,
      }));
    return [allFormsItem, ...formItems];
  }, [accessibleForms, allSignals, nodeSearch, t, unreadCountByFormId]);

  if (loading) {
    return <div className="panel">{t("loadingResearchLab")}</div>;
  }

  if (isLoadingAccess) {
    return <div className="panel">Checking wallet capabilities...</div>;
  }

  return (
    <AdminAccessGate
      hasWallet={Boolean(account?.address)}
      access={accessState}
      deniedBody={
        capabilityProfile.isConfigured
          ? "OwnerCap / AdminCap / ReviewerCap を持つウォレットだけが review console を開けます。"
          : undefined
      }
    >
      <section className="stack">
        {toast ? (
          <div className={`signal-toast is-${toast.tone}`} role="status" aria-live="polite">
            {toast.message}
          </div>
        ) : null}
        <div className="panel glow-panel inbox-shell-header">
          <div>
            <p className="eyebrow">{t("creatorOnlyInbox")}</p>
            <h1>{t("signalInboxTitle")}</h1>
            <p className="lede">{t("signalInboxDescription")}</p>
            {capabilityProfile.isConfigured ? (
              <p className="muted">
                Access Role: {getRoleLabel(capabilityProfile)}
                {isLoadingCapabilities ? " / checking wallet objects..." : ""}
              </p>
            ) : null}
          </div>
        </div>

        {capabilityProfile.isConfigured ? (
          <AccessOverviewCard
            capabilityProfile={capabilityProfile}
            manageHref="/admin/access"
          />
        ) : null}

        <div className="mobile-console-banner">{t("adminDesktopNotice")}</div>

        {accessibleForms.length === 0 ? (
          <EmptyState>
            <h2>{t("noCreatorInboxesTitle")}</h2>
            <p>{t("noCreatorInboxesBody")}</p>
            {hasAdminAccess || !capabilityProfile.isConfigured ? (
              <Link className="primary-button" to="/admin/forms/new">
                {t("createSignalForm")}
              </Link>
            ) : null}
          </EmptyState>
        ) : (
          <div className="signal-console-layout">
            <aside className="panel signal-sidebar">
              <div className="signal-sidebar-section">
                <p className="eyebrow">{t("signalStreamsTitle")}</p>
                <div className="stream-list">
                  {streamItems.map((stream) => (
                    <button
                      key={stream.id}
                      type="button"
                      className={`stream-item ${selectedStreamId === stream.id ? "is-active" : ""}`}
                      onClick={() => setSelectedStreamId(stream.id)}
                    >
                      <span>{stream.label}</span>
                      <strong>{stream.count}</strong>
                    </button>
                  ))}
                </div>
              </div>

              <div className="signal-sidebar-section">
                <div className="section-row">
                  <p className="eyebrow">{t("signalNodesTitle")}</p>
                  <span className="muted">{accessibleForms.length}</span>
                </div>
                <div className="signal-node-summary">
                  <div className="signal-node-summary-copy">
                    <strong>
                      {selectedFormId === "all"
                        ? t("allSignalNodes")
                        : selectedForm?.title ?? t("selectedNode")}
                    </strong>
                    <p className="muted">{t("activeNodeSummary", { count: accessibleForms.length })}</p>
                  </div>
                  <button
                    type="button"
                    className="primary-button signal-node-directory-trigger"
                    onClick={() => setNodeDirectoryOpen(true)}
                  >
                    {t("openNodeDirectory")}
                  </button>
                </div>
              </div>

            </aside>

            <section className="panel signal-inbox-column">
              <div className="signal-column-header">
                <div>
                  <p className="eyebrow">{t("signalInboxTitle")}</p>
                  <h2>{streamItems.find((stream) => stream.id === selectedStreamId)?.label}</h2>
                  <p className="muted">
                    {t("unreadCountSummary", {
                      count: visibleSignals.filter((record) => record.submission.status === "unread").length,
                      scope:
                        selectedFormId === "all"
                          ? t("allSignalNodes")
                          : accessibleForms.find((form) => form.id === selectedFormId)?.title ??
                            t("selectedNode"),
                    })}
                  </p>
                </div>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("searchSignalsPlaceholder")}
                />
              </div>

              {visibleSignals.length === 0 ? (
                <EmptyState>
                  <h2>{t("noSignalsInStream")}</h2>
                  <p>{t("adjustSignalFilters")}</p>
                </EmptyState>
              ) : (
                <div className="signal-list">
                  {visibleSignals.map((record) => {
                    const { form, submission, category } = record;
                    const isSelected = selectedRecord?.submission.id === submission.id;
                    const storageLabel = getStorageBadgeLabel(
                      submission.encryptedBlobId ?? submission.blobId,
                    );
                    return (
                      <button
                        key={submission.id}
                        type="button"
                        className={`signal-card ${isSelected ? "is-active" : ""} ${submission.status === "unread" ? "is-unread" : "is-read"}`}
                        onClick={() => void handleSelect(record)}
                      >
                        <div className="signal-card-topline">
                          <strong>{getSignalSubject(submission)}</strong>
                          <span>{formatDate(submission.createdAt)}</span>
                        </div>
                        <p className="signal-card-form">{form.title}</p>
                        <p className="signal-card-preview">{getSignalPreview(submission)}</p>
                        <div className="signal-badge-row">
                          <span className="signal-chip">{category}</span>
                          {typeof submission.ratingValue === "number" ? (
                            <span className="signal-chip">
                              {t("ratingLabel", { value: submission.ratingValue })}
                            </span>
                          ) : null}
                          <span className="signal-chip">
                            {t("attachmentCountLabel", { count: submission.attachments.length })}
                          </span>
                          {submission.isEncrypted ? (
                            <span className="signal-chip signal-chip-accent">
                              {t("encryptedSignalLabel")}
                            </span>
                          ) : null}
                          <span className="signal-chip">{storageLabel}</span>
                          {submission.status === "unread" ? (
                            <span className="signal-chip signal-chip-accent">
                              {t("newSignalLabel")}
                            </span>
                          ) : null}
                          {submission.priority === "high" ? (
                            <span className="signal-chip signal-chip-warn">
                              {t("highPrioritySignals")}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <article className="panel signal-detail-column">
              {!selectedRecord ? (
                <EmptyState>
                  <h2>{t("selectSignalToReview")}</h2>
                  <p>{t("incomingEncryptedFeedback")}</p>
                </EmptyState>
              ) : (
                <>
                  <div className="signal-detail-heading">
                    <div>
                      <p className="eyebrow">{t("signalDetailTitle")}</p>
                      <h2>{getSignalSubject(selectedRecord.submission)}</h2>
                      <p className="muted">
                        {selectedRecord.form.title} · {formatDate(selectedRecord.submission.createdAt)}
                      </p>
                    </div>
                    <div className="inline-actions">
                      <Link
                        className="ghost-button"
                        to={`/dashboard/forms/${selectedRecord.form.id}/submissions/${selectedRecord.submission.id}`}
                      >
                        {t("openFormInbox")}
                      </Link>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() =>
                          exportSubmissionJson(selectedRecord.form, selectedRecord.submission)
                        }
                      >
                        {t("exportJson")}
                      </button>
                    </div>
                  </div>

                  <div className="signal-detail-meta-row">
                    <span className={`pill status-${selectedRecord.submission.status}`}>
                      {selectedRecord.submission.status}
                    </span>
                    <span className={`pill priority-${selectedRecord.submission.priority}`}>
                      {selectedRecord.submission.priority}
                    </span>
                    <span className="pill">{selectedRecord.category}</span>
                    <span className="pill">
                      {t("ratingLabel", {
                        value: selectedRecord.submission.ratingValue ?? t("notAvailable"),
                      })}
                    </span>
                  </div>

                  {selectedRecord.submission.isEncrypted ? (
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => void handleDecrypt()}
                        disabled={decrypting}
                      >
                        {decrypting ? t("decryptingSignal") : t("decryptSignal")}
                      </button>
                      {!isLocalFallbackBlob(selectedRecord.submission.encryptedBlobId) ? (
                        <BlobLink
                          blobId={selectedRecord.submission.encryptedBlobId}
                          label={t("verifyOnWalrus")}
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {selectedRecord.submission.isEncrypted && !detailAnswers ? (
                    <p className="muted">
                      {sealRuntime.activeMode === "mock"
                        ? t("demoDecryptAvailable")
                        : t("policyGatedDecryption")}
                    </p>
                  ) : null}

                  {decryptError ? <p className="warning-text">{decryptError}</p> : null}

                  <div className="signal-detail-sections">
                    <section className="answer-card">
                      <h3>{t("answersTitle")}</h3>
                      {detailAnswers ? (
                        <div className="stack">
                          {selectedRecord.form.fields.map((field) => (
                            <div key={field.id} className="answer-line">
                              <strong>{field.label}</strong>
                              <p>{flattenAnswer(detailAnswers[field.id]) || t("noAnswerLabel")}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="muted">{t("encryptedFeedbackHidden")}</p>
                      )}
                    </section>

                    <section className="answer-card">
                      <h3>{t("attachments")}</h3>
                      {detailAttachments.length === 0 ? (
                        <p className="muted">{t("noAttachments")}</p>
                      ) : (
                        <div className="stack">
                          {detailAttachments.map((attachment) => (
                            <div key={attachment.blobId} className="attachment-row">
                              <div>
                                <strong>{attachment.name}</strong>
                                <p className="muted">
                                  {attachment.type} · {Math.round(attachment.size / 1024)} KB
                                </p>
                              </div>
                              <div className="stack">
                                <span className="blob-prominent">{attachment.blobId}</span>
                                {!isLocalFallbackBlob(attachment.blobId) ? (
                                  <BlobLink
                                    blobId={attachment.blobId}
                                    label={t("verifyOnWalrus")}
                                  />
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="answer-card">
                      <h3>{t("reviewControlsTitle")}</h3>
                      <label>
                        <span>{t("status")}</span>
                        <select
                          value={selectedRecord.submission.status}
                          onChange={(event) =>
                            void updateSubmission({
                              ...selectedRecord.submission,
                              status: event.target.value as Submission["status"],
                            })
                          }
                        >
                          <option value="unread">{t("statusUnread")}</option>
                          <option value="read">{t("statusRead")}</option>
                          <option value="archived">{t("statusArchived")}</option>
                        </select>
                      </label>
                      <label>
                        <span>{t("priority")}</span>
                        <select
                          value={selectedRecord.submission.priority}
                          onChange={(event) =>
                            void updateSubmission({
                              ...selectedRecord.submission,
                              priority: event.target.value as Submission["priority"],
                            })
                          }
                        >
                          <option value="low">{t("priorityLow")}</option>
                          <option value="medium">{t("priorityMedium")}</option>
                          <option value="high">{t("priorityHigh")}</option>
                        </select>
                      </label>
                    </section>

                    <section className="answer-card">
                      <div className="section-row">
                        <h3>{t("tags")}</h3>
                        <span className="muted">{selectedRecord.submission.tags.length}</span>
                      </div>
                      <div className="pill-row">
                        {selectedRecord.submission.tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className="tag-pill"
                            onClick={() =>
                              void updateSubmission({
                                ...selectedRecord.submission,
                                tags: selectedRecord.submission.tags.filter((item) => item !== tag),
                              })
                            }
                          >
                            {tag} ×
                          </button>
                        ))}
                      </div>
                      <div className="inline-actions">
                        <input
                          value={draftTag}
                          onChange={(event) => setDraftTag(event.target.value)}
                          placeholder={t("addTagPlaceholder")}
                        />
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={!draftTag.trim() || saving}
                          onClick={() => {
                            const nextTag = draftTag.trim();
                            if (selectedRecord.submission.tags.includes(nextTag)) {
                              setDraftTag("");
                              return;
                            }
                            setDraftTag("");
                            void updateSubmission({
                              ...selectedRecord.submission,
                              tags: [...selectedRecord.submission.tags, nextTag],
                            });
                          }}
                        >
                          {t("addTag")}
                        </button>
                      </div>
                    </section>

                    <section className="answer-card">
                      <h3>{t("notesTitle")}</h3>
                      <textarea
                        rows={6}
                        value={notesDraft}
                        onChange={(event) => setNotesDraft(event.target.value)}
                        placeholder={t("captureReviewNotes")}
                      />
                      <button
                        type="button"
                        className="primary-button"
                        disabled={saving}
                        onClick={() =>
                          void updateSubmission({
                            ...selectedRecord.submission,
                            notes: notesDraft,
                          })
                        }
                      >
                        {t("saveNote")}
                      </button>
                    </section>

                    <section className="answer-card">
                      <div className="section-row">
                        <h3>{t("signalMetadataTitle")}</h3>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setShowMetadata((current) => !current)}
                        >
                          {showMetadata ? t("hideSignalMetadata") : t("showSignalMetadata")}
                        </button>
                      </div>
                      {showMetadata ? (
                        <div className="metadata-list">
                          <div className="metadata-row">
                            <span>{t("formBlobId")}</span>
                            <div>
                              <strong className="blob-prominent">
                                {selectedRecord.form.blobId ?? t("notAvailable")}
                              </strong>
                              {!isLocalFallbackBlob(selectedRecord.form.blobId) ? (
                                <BlobLink
                                  blobId={selectedRecord.form.blobId}
                                  label={t("verifyOnWalrus")}
                                />
                              ) : null}
                            </div>
                          </div>
                          <div className="metadata-row">
                            <span>{t("submissionBlobIdLabel")}</span>
                            <div>
                              <strong className="blob-prominent">
                                {selectedRecord.submission.blobId ?? t("notAvailable")}
                              </strong>
                              {!isLocalFallbackBlob(selectedRecord.submission.blobId) ? (
                                <BlobLink
                                  blobId={selectedRecord.submission.blobId}
                                  label={t("verifyOnWalrus")}
                                />
                              ) : null}
                            </div>
                          </div>
                          <div className="metadata-row">
                            <span>{t("encryptedPayloadBlobId")}</span>
                            <div>
                              <strong className="blob-prominent">
                                {selectedRecord.submission.encryptedBlobId ?? t("notAvailable")}
                              </strong>
                              {!isLocalFallbackBlob(selectedRecord.submission.encryptedBlobId) ? (
                                <BlobLink
                                  blobId={selectedRecord.submission.encryptedBlobId}
                                  label={t("verifyOnWalrus")}
                                />
                              ) : null}
                            </div>
                          </div>
                          <div className="metadata-row">
                            <span>{t("attachmentBlobIds")}</span>
                            <div className="stack">
                              {selectedRecord.submission.attachments.length === 0 ? (
                                <strong>{t("notAvailable")}</strong>
                              ) : (
                                selectedRecord.submission.attachments.map((attachment) => (
                                  <div key={attachment.blobId}>
                                    <strong className="blob-prominent">{attachment.blobId}</strong>
                                    {!isLocalFallbackBlob(attachment.blobId) ? (
                                      <BlobLink
                                        blobId={attachment.blobId}
                                        label={t("verifyOnWalrus")}
                                      />
                                    ) : null}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                          <div className="metadata-row">
                            <span>{t("storageMode")}</span>
                            <strong>
                              {storageRuntime.mode === "walrus"
                                ? t("storageWalrus")
                                : t("localFallbackLabel")}
                            </strong>
                          </div>
                          <div className="metadata-row">
                            <span>{t("sealModeLabel")}</span>
                            <strong>{sealRuntime.isFallback ? "fallback" : sealRuntime.activeMode}</strong>
                          </div>
                          <div className="metadata-row">
                            <span>{t("walletAccessStatus")}</span>
                            <strong>
                              {getWalletAccessLabel(selectedRecord.form, account?.address)}
                            </strong>
                          </div>
                        </div>
                      ) : null}
                    </section>

                    <section className="answer-card">
                      <div className="section-row">
                        <h3>{t("encryptedSignalLabel")}</h3>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setShowEncryptedSignal((current) => !current)}
                        >
                          {showEncryptedSignal ? t("hideEncryptedSignal") : t("showEncryptedSignal")}
                        </button>
                      </div>
                      {showEncryptedSignal ? (
                        <SealStatusCard
                          encryptSubmissions={selectedRecord.form.encryptSubmissions}
                          encryptedBlobId={selectedRecord.submission.encryptedBlobId}
                          canDecrypt={Boolean(account?.address)}
                          walletAccessStatus={getWalletAccessLabel(selectedRecord.form, account?.address)}
                        />
                      ) : null}
                    </section>

                    <section className="answer-card">
                      <div className="section-row">
                        <div>
                          <p className="eyebrow">{t("nodeActions")}</p>
                          <h3>{selectedRecord.form.title}</h3>
                        </div>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setNodeDirectoryOpen(true)}
                        >
                          {t("openNodeDirectory")}
                        </button>
                      </div>
                      <div className="inline-actions">
                        <Link className="ghost-button" to={`/f/${selectedRecord.form.id}`}>
                          {t("openPublicForm")}
                        </Link>
                        <Link className="ghost-button" to={`/dashboard/forms/${selectedRecord.form.id}`}>
                          {t("reviewSubmissions")}
                        </Link>
                      </div>
                    </section>
                  </div>
                </>
              )}
            </article>
          </div>
        )}
      </section>
      {nodeDirectoryOpen ? (
        <div className="node-directory-overlay" role="dialog" aria-modal="true">
          <div className="node-directory-backdrop" onClick={() => setNodeDirectoryOpen(false)} />
          <section className="panel glow-panel node-directory-panel">
            <div className="signal-detail-heading">
              <div>
                <p className="eyebrow">{t("signalNodesTitle")}</p>
                <h2>{t("nodeDirectoryTitle")}</h2>
                <p className="muted">{t("nodeDirectoryDescription")}</p>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setNodeDirectoryOpen(false)}
              >
                {t("closeLabel")}
              </button>
            </div>

            <div className="node-directory-toolbar">
              <input
                value={nodeSearch}
                onChange={(event) => setNodeSearch(event.target.value)}
                placeholder={t("searchNodesPlaceholder")}
              />
              <div className="node-directory-stats">
                <span className="signal-chip">
                  {t("activeNodeSummary", { count: accessibleForms.length })}
                </span>
                <span className="signal-chip">
                  {t("signalsCount", { count: allSignals.length })}
                </span>
              </div>
            </div>

            <div className="node-directory-list">
              {nodeDirectoryItems.map((item) => {
                const isSelected = selectedFormId === item.id;
                return (
                  <div key={item.id} className={`node-directory-row ${isSelected ? "is-active" : ""}`}>
                    <button
                      type="button"
                      className={`node-directory-item ${isSelected ? "is-active" : ""}`}
                      onClick={() => {
                        setSelectedFormId(item.id);
                        setNodeDirectoryOpen(false);
                      }}
                    >
                      <div className="node-directory-item-main">
                        <div className="node-directory-item-heading">
                          <strong>{item.title}</strong>
                          {item.unreadCount > 0 ? (
                            <span className="node-unread-badge">
                              {t("unreadBadge", { count: item.unreadCount })}
                            </span>
                          ) : null}
                        </div>
                        <p className="muted">
                          {t("signalsCount", { count: item.submissionCount })}
                          {item.isLegacyDemo ? ` · ${t("legacyDemoForm")}` : ""}
                        </p>
                      </div>
                    </button>
                    {item.id !== "all" ? (
                      <div className="node-directory-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => {
                            setBeaconFormId(item.id);
                            setNodeDirectoryOpen(false);
                          }}
                        >
                          {t("openSignalBeacon")}
                        </button>
                        {hasAdminAccess || !capabilityProfile.isConfigured ? (
                          <button
                            type="button"
                            className="ghost-button node-directory-delete"
                            onClick={() => void handleDelete(item.id)}
                            disabled={deletingFormId === item.id}
                          >
                            {deletingFormId === item.id ? t("deletingLabel") : t("deleteNode")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {nodeDirectoryItems.length === 1 && nodeSearch.trim() ? (
                <EmptyState>
                  <h2>{t("noNodesFoundTitle")}</h2>
                  <p>{t("noNodesFoundBody")}</p>
                </EmptyState>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      {selectedBeaconForm ? (
        <div className="node-directory-overlay" role="dialog" aria-modal="true">
          <div className="node-directory-backdrop" onClick={() => setBeaconFormId(null)} />
          <section className="panel glow-panel node-directory-panel beacon-overlay-panel">
            <div className="signal-detail-heading">
              <div>
                <p className="eyebrow">{t("signalBeaconLabel")}</p>
                <h2>{selectedBeaconForm.title}</h2>
                <p className="muted">{t("signalBeaconFromNodeDescription")}</p>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setBeaconFormId(null)}
              >
                {t("closeLabel")}
              </button>
            </div>
            <ShareCard
              formId={selectedBeaconForm.id}
              blobId={selectedBeaconForm.blobId}
              createdAt={selectedBeaconForm.createdAt}
            />
          </section>
        </div>
      ) : null}
    </AdminAccessGate>
  );
}
