import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { BlobLink } from "../components/BlobLink";
import { EmptyState } from "../components/EmptyState";
import { SealStatusCard } from "../components/SealStatusCard";
import { useAccessControl } from "../hooks/useAccessControl";
import { shortenContributorId } from "../lib/contributors";
import { getSealRuntimeStatus } from "../crypto/cryptoFactory";
import { useI18n } from "../i18n";
import { getReviewAccessState, getRoleLabel } from "../lib/adminAccess";
import { exportSubmissionJson, exportSubmissionsCsv, exportSummaryJson } from "../lib/export";
import {
  getSignalPreview,
  getSignalSubject,
  getStorageDetailLabels,
  getWalletAccessLabel,
  inferSignalCategory,
  isLocalFallbackBlob,
} from "../lib/signalInbox";
import { getTriageStatusLabel, TRIAGE_STATUS_OPTIONS } from "../lib/signalOps";
import {
  normalizeForm,
  normalizeSubmission,
  resolveSubmissionAnswers,
  storageAdapter,
} from "../lib/storage";
import { buildSurveySummary } from "../lib/surveySummary";
import { formatDate, flattenAnswer } from "../lib/utils";
import { getStorageRuntimeStatus } from "../storage/storageFactory";
import type { FormSchema, Submission } from "../types";

type StreamId =
  | "all"
  | "unread"
  | "encrypted"
  | "high"
  | "planned"
  | "in_progress"
  | "fixed"
  | "bug"
  | "feature"
  | "survey"
  | "archived";

function matchesStream(submission: Submission, streamId: StreamId) {
  const category = inferSignalCategory(submission);
  switch (streamId) {
    case "unread":
      return submission.status === "unread";
    case "encrypted":
      return submission.isEncrypted;
    case "high":
      return submission.priority === "high";
    case "planned":
      return submission.triageStatus === "planned";
    case "in_progress":
      return submission.triageStatus === "in_progress";
    case "fixed":
      return submission.triageStatus === "fixed";
    case "bug":
      return category === "Bug";
    case "feature":
      return category === "Feature";
    case "survey":
      return category === "Survey";
    case "archived":
      return submission.status === "archived";
    default:
      return true;
  }
}

export function FormSubmissionsPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const { capabilityProfile, isLoadingAccess } = useAccessControl(account?.address);
  const { formId = "", submissionId = "" } = useParams();
  const sealRuntime = getSealRuntimeStatus();
  const storageRuntime = getStorageRuntimeStatus();
  const [form, setForm] = useState<FormSchema | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSignalId, setSelectedSignalId] = useState(submissionId);
  const [selectedStreamId, setSelectedStreamId] = useState<StreamId>("all");
  const [search, setSearch] = useState("");
  const [detailAnswers, setDetailAnswers] = useState<Record<string, unknown> | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<Submission["attachments"]>([]);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [draftTag, setDraftTag] = useState("");
  const [githubIssueDraft, setGithubIssueDraft] = useState("");
  const [githubPrDraft, setGithubPrDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showEncryptedSignal, setShowEncryptedSignal] = useState(false);
  const saveQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    void loadInbox();
  }, [formId]);

  async function loadInbox(preferredSignalId?: string) {
    const [nextForm, rawSubmissions] = await Promise.all([
      storageAdapter.getForm(formId),
      storageAdapter.listSubmissions(formId),
    ]);
    setForm(nextForm ? normalizeForm(nextForm) : null);
    setSubmissions(rawSubmissions.map((submission) => normalizeSubmission(submission)));
    setSelectedSignalId((current) => preferredSignalId ?? submissionId ?? current);
    setLoading(false);
  }

  const visibleSignals = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return submissions.filter((submission) => {
      if (!matchesStream(submission, selectedStreamId)) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      const searchable = [
        getSignalSubject(submission),
        getSignalPreview(submission),
        flattenAnswer(submission.answers),
        submission.tags.join(" "),
        inferSignalCategory(submission),
        submission.contributorId ?? "",
        getTriageStatusLabel(submission.triageStatus),
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedSearch);
    });
  }, [search, selectedStreamId, submissions]);

  const selectedSubmission =
    visibleSignals.find((submission) => submission.id === selectedSignalId) ??
    submissions.find((submission) => submission.id === selectedSignalId) ??
    visibleSignals[0] ??
    null;

  useEffect(() => {
    if (!selectedSubmission) {
      setDetailAnswers(null);
      setDetailAttachments([]);
      setNotesDraft("");
      setGithubIssueDraft("");
      setGithubPrDraft("");
      setDecryptError("");
      setSaveError("");
      setSaveState("idle");
      return;
    }
    setNotesDraft(selectedSubmission.notes);
    setGithubIssueDraft(selectedSubmission.githubIssueUrl ?? "");
    setGithubPrDraft(selectedSubmission.githubPrUrl ?? "");
    setDetailAnswers(selectedSubmission.isEncrypted ? null : selectedSubmission.answers);
    setDetailAttachments(selectedSubmission.attachments ?? []);
    setDecryptError("");
    setSaveError("");
  }, [selectedSubmission]);

  function applySubmissionUpdate(nextSubmission: Submission) {
    setSubmissions((current) =>
      current.map((submission) =>
        submission.id === nextSubmission.id ? nextSubmission : submission,
      ),
    );
  }

  async function updateSubmission(nextSubmission: Submission) {
    const normalized = normalizeSubmission(nextSubmission);
    applySubmissionUpdate(normalized);
    setSelectedSignalId(normalized.id);
    setSaveState("saving");
    setSaveError("");
    const runSave = async () => {
      try {
        await storageAdapter.updateSubmission(normalized);
        setSaveState("saved");
      } catch (error) {
        setSaveState("error");
        setSaveError(error instanceof Error ? error.message : "Failed to save signal operations.");
      }
    };
    saveQueueRef.current = saveQueueRef.current.then(runSave, runSave);
    await saveQueueRef.current;
  }

  async function handleSelect(submission: Submission) {
    setSelectedSignalId(submission.id);
    if (submission.status === "unread") {
      await updateSubmission({ ...submission, status: "read" });
    }
  }

  async function handleDecrypt() {
    if (!form || !selectedSubmission) {
      return;
    }
    setDecrypting(true);
    setDecryptError("");
    try {
      const resolved = await resolveSubmissionAnswers(form, selectedSubmission);
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
    { id: "all", label: t("allSignals"), count: submissions.length },
    {
      id: "unread",
      label: t("unreadSignals"),
      count: submissions.filter((submission) => submission.status === "unread").length,
    },
    {
      id: "encrypted",
      label: t("encryptedSignals"),
      count: submissions.filter((submission) => submission.isEncrypted).length,
    },
    {
      id: "high",
      label: t("highPrioritySignals"),
      count: submissions.filter((submission) => submission.priority === "high").length,
    },
    {
      id: "planned",
      label: "Planned Signals",
      count: submissions.filter((submission) => submission.triageStatus === "planned").length,
    },
    {
      id: "in_progress",
      label: "In Progress",
      count: submissions.filter((submission) => submission.triageStatus === "in_progress").length,
    },
    {
      id: "fixed",
      label: "Fixed Signals",
      count: submissions.filter((submission) => submission.triageStatus === "fixed").length,
    },
    {
      id: "bug",
      label: t("bugReports"),
      count: submissions.filter((submission) => inferSignalCategory(submission) === "Bug").length,
    },
    {
      id: "feature",
      label: t("featureRequests"),
      count: submissions.filter((submission) => inferSignalCategory(submission) === "Feature").length,
    },
    {
      id: "survey",
      label: t("surveys"),
      count: submissions.filter((submission) => inferSignalCategory(submission) === "Survey").length,
    },
    {
      id: "archived",
      label: t("archivedSignals"),
      count: submissions.filter((submission) => submission.status === "archived").length,
    },
  ] satisfies Array<{ id: StreamId; label: string; count: number }>;

  const summaryCards = [
    { label: "Total signals", value: submissions.length },
    {
      label: "New signals",
      value: submissions.filter((submission) => submission.triageStatus === "new").length,
    },
    {
      label: "Planned",
      value: submissions.filter((submission) => submission.triageStatus === "planned").length,
    },
    {
      label: "Fixed",
      value: submissions.filter((submission) => submission.triageStatus === "fixed").length,
    },
    {
      label: "High value signals",
      value: submissions.filter((submission) => (submission.signalValue ?? 0) >= 4).length,
    },
    {
      label: "Average signal value",
      value:
        submissions.filter((submission) => typeof submission.signalValue === "number").length === 0
          ? "N/A"
          : (
              submissions.reduce((sum, submission) => sum + (submission.signalValue ?? 0), 0) /
              submissions.filter((submission) => typeof submission.signalValue === "number").length
            ).toFixed(1),
    },
  ];

  if (loading) {
    return <div className="panel">{t("loadingSubmissions")}</div>;
  }

  if (!form) {
    return (
      <EmptyState>
        <h1>{t("emptyFormNotFound")}</h1>
      </EmptyState>
    );
  }

  if (isLoadingAccess) {
    return <div className="panel">Checking wallet capabilities...</div>;
  }

  const access = getReviewAccessState(form, account?.address, capabilityProfile);
  const surveySummary = buildSurveySummary(form, submissions);
  const showSurveySummary =
    form.purpose === "survey" ||
    submissions.some((submission) => inferSignalCategory(submission) === "Survey");

  return (
    <AdminAccessGate
      hasWallet={Boolean(account?.address)}
      access={access}
      legacyMessage={t("legacyDemoFormBody")}
      deniedBody={
        capabilityProfile.isConfigured
          ? "OwnerCap / AdminCap / ReviewerCap を持つウォレットだけが review 操作を実行できます。"
          : undefined
      }
    >
      <section className="stack">
        <div className="panel glow-panel inbox-shell-header">
          <div>
            <p className="eyebrow">Signal Triage</p>
            <h1>{form.title}</h1>
            <p className="lede">{form.description || t("encryptedSignalReviewForForm")}</p>
          </div>
          <div className="inbox-header-actions">
            <Link className="ghost-button" to="/admin">
              {t("allInboxes")}
            </Link>
            <Link className="ghost-button" to={`/roadmap/${form.id}`}>
              Open Public Roadmap
            </Link>
            <Link className="primary-button" to={`/f/${form.id}`}>
              {t("openPublicForm")}
            </Link>
          </div>
        </div>

        <div className="summary-grid">
          {summaryCards.map((card) => (
            <article key={card.label} className="signal-metric">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </div>

        <div className="mobile-console-banner">{t("adminDesktopNotice")}</div>

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

            <div className="signal-sidebar-section stack">
              <div className="wallet-status-card">
                <p className="eyebrow">{t("walletStatus")}</p>
                <strong>{getWalletAccessLabel(form, account?.address)}</strong>
                <p className="muted">{form.ownerAddress ?? t("legacyDemoForm")}</p>
              </div>

              {capabilityProfile.isConfigured ? (
                <div className="wallet-status-card">
                  <p className="eyebrow">Access role</p>
                  <strong>{getRoleLabel(capabilityProfile)}</strong>
                  <p className="muted">
                    OwnerCap {capabilityProfile.ownerCapIds.length} / AdminCap{" "}
                    {capabilityProfile.adminCapIds.length} / ReviewerCap{" "}
                    {capabilityProfile.reviewerCapIds.length}
                  </p>
                </div>
              ) : null}

              <div className="wallet-status-card">
                <p className="eyebrow">{t("formBlobId")}</p>
                <strong className="blob-prominent">{form.blobId ?? t("notAvailable")}</strong>
                {!isLocalFallbackBlob(form.blobId) ? (
                  <BlobLink blobId={form.blobId} label={t("verifyOnWalrus")} />
                ) : null}
              </div>

              <button
                type="button"
                className="ghost-button"
                onClick={() => exportSubmissionsCsv(form, submissions)}
                disabled={submissions.length === 0}
              >
                {t("exportCsv")}
              </button>
              {showSurveySummary ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => exportSummaryJson(form, surveySummary)}
                >
                  {t("exportSummaryJson")}
                </button>
              ) : null}
            </div>
          </aside>

          <section className="panel signal-inbox-column">
            <div className="signal-column-header">
              <div>
                <p className="eyebrow">Deep Signals Worth Tracking</p>
                <h2>{streamItems.find((stream) => stream.id === selectedStreamId)?.label}</h2>
                <p className="muted">
                  {t("unreadCountSummary", {
                    count: visibleSignals.filter((submission) => submission.status === "unread").length,
                    scope: t("totalCountLabel", { count: submissions.length }),
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
                <p>{t("newEncryptedFeedbackHere")}</p>
              </EmptyState>
            ) : (
              <div className="signal-list">
                {visibleSignals.map((submission) => {
                  const category = inferSignalCategory(submission);
                  const isSelected = selectedSubmission?.id === submission.id;
                  return (
                    <button
                      key={submission.id}
                      type="button"
                      className={`signal-card ${isSelected ? "is-active" : ""} ${submission.status === "unread" ? "is-unread" : "is-read"}`}
                      onClick={() => void handleSelect(submission)}
                    >
                      <div className="signal-card-topline">
                        <strong>{getSignalSubject(submission)}</strong>
                        <span>{formatDate(submission.createdAt)}</span>
                      </div>
                      <p className="signal-card-form">{form.title}</p>
                      <p className="signal-card-preview">{getSignalPreview(submission)}</p>
                      <div className="signal-badge-row">
                        <span className="signal-chip">{category}</span>
                        <span className="signal-chip">{getTriageStatusLabel(submission.triageStatus)}</span>
                        <span className="signal-chip">Contributor {shortenContributorId(submission.contributorId)}</span>
                        {typeof submission.signalValue === "number" ? (
                          <span className="signal-chip">Signal Value {submission.signalValue}/5</span>
                        ) : null}
                        {typeof submission.ratingValue === "number" ? (
                          <span className="signal-chip">
                            {t("ratingLabel", { value: submission.ratingValue })}
                          </span>
                        ) : null}
                        {submission.isEncrypted ? (
                          <span className="signal-chip signal-chip-accent">
                            {t("encryptedSignalLabel")}
                          </span>
                        ) : null}
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
            {!selectedSubmission ? (
              <EmptyState>
                <h2>{t("selectSignalToReview")}</h2>
                <p>{t("incomingEncryptedFeedback")}</p>
              </EmptyState>
            ) : (
              <>
                <div className="signal-detail-heading">
                  <div>
                    <p className="eyebrow">Contributor Signal</p>
                    <h2>{getSignalSubject(selectedSubmission)}</h2>
                    <p className="muted">{formatDate(selectedSubmission.createdAt)}</p>
                  </div>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => exportSubmissionJson(form, selectedSubmission)}
                    >
                      {t("exportJson")}
                    </button>
                  </div>
                </div>

                <div className="signal-detail-meta-row">
                  <span className={`pill status-${selectedSubmission.status}`}>
                    {selectedSubmission.status}
                  </span>
                  <span className={`pill priority-${selectedSubmission.priority}`}>
                    {selectedSubmission.priority}
                  </span>
                  <span className="pill">{getTriageStatusLabel(selectedSubmission.triageStatus)}</span>
                  <span className="pill">{inferSignalCategory(selectedSubmission)}</span>
                  <span className="pill">Signal Value {selectedSubmission.signalValue ?? "N/A"}</span>
                </div>

                {selectedSubmission.isEncrypted ? (
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void handleDecrypt()}
                      disabled={decrypting}
                    >
                      {decrypting ? t("decryptingSignal") : t("decryptSignal")}
                    </button>
                    {!isLocalFallbackBlob(selectedSubmission.encryptedBlobId) ? (
                      <BlobLink
                        blobId={selectedSubmission.encryptedBlobId}
                        label={t("verifyOnWalrus")}
                      />
                    ) : null}
                  </div>
                ) : null}

                {selectedSubmission.isEncrypted && !detailAnswers ? (
                  <p className="muted">
                    {sealRuntime.activeMode === "mock"
                      ? t("demoDecryptAvailable")
                      : t("policyGatedDecryption")}
                  </p>
                ) : null}

                {decryptError ? <p className="warning-text">{decryptError}</p> : null}

                <div className="signal-detail-sections">
                  {showSurveySummary ? (
                    <section className="answer-card">
                      <div className="section-row">
                        <h3>{t("surveySummaryTitle")}</h3>
                        <span className="muted">{t("submissionCountLabel", { count: surveySummary.submissionCount })}</span>
                      </div>
                      <div className="metadata-list">
                        <div className="metadata-row">
                          <span>{t("submissionCount")}</span>
                          <strong>{surveySummary.submissionCount}</strong>
                        </div>
                        <div className="metadata-row">
                          <span>{t("averageRating")}</span>
                          <strong>{surveySummary.averageRating ?? t("notAvailable")}</strong>
                        </div>
                      </div>
                      {surveySummary.encryptedPendingCount > 0 ? (
                        <p className="warning-text">{t("surveySummaryEncryptedNotice")}</p>
                      ) : null}
                    </section>
                  ) : null}

                  <section className="answer-card">
                    <h3>{t("answersTitle")}</h3>
                    {detailAnswers ? (
                      <div className="stack">
                        {form.fields.map((field) => (
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
                              <strong className="blob-prominent">{attachment.blobId}</strong>
                              {!isLocalFallbackBlob(attachment.blobId) ? (
                                <BlobLink blobId={attachment.blobId} label={t("verifyOnWalrus")} />
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="answer-card">
                    <div className="section-row">
                      <h3>Signal Operations</h3>
                      <span className={`save-state-pill is-${saveState}`}>
                        {saveState === "saving"
                          ? "Saving signal ops..."
                          : saveState === "saved"
                            ? "Saved"
                            : saveState === "error"
                              ? "Save failed"
                              : "Ready"}
                      </span>
                    </div>
                    {saveError ? <p className="warning-text">{saveError}</p> : null}
                    <label>
                      <span>{t("status")}</span>
                      <select
                        value={selectedSubmission.status}
                        onChange={(event) =>
                          void updateSubmission({
                            ...selectedSubmission,
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
                      <span>Signal Triage</span>
                      <select
                        value={selectedSubmission.triageStatus}
                        onChange={(event) =>
                          void updateSubmission({
                            ...selectedSubmission,
                            triageStatus: event.target.value as Submission["triageStatus"],
                          })
                        }
                      >
                        {TRIAGE_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{t("priority")}</span>
                      <select
                        value={selectedSubmission.priority}
                        onChange={(event) =>
                          void updateSubmission({
                            ...selectedSubmission,
                            priority: event.target.value as Submission["priority"],
                          })
                        }
                      >
                        <option value="low">{t("priorityLow")}</option>
                        <option value="medium">{t("priorityMedium")}</option>
                        <option value="high">{t("priorityHigh")}</option>
                      </select>
                    </label>
                    <label>
                      <span>Signal Value</span>
                      <select
                        value={selectedSubmission.signalValue?.toString() ?? ""}
                        onChange={(event) =>
                          void updateSubmission({
                            ...selectedSubmission,
                            signalValue: event.target.value ? Number(event.target.value) : undefined,
                          })
                        }
                      >
                        <option value="">Not scored</option>
                        {[1, 2, 3, 4, 5].map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  </section>

                  <section className="answer-card">
                    <div className="section-row">
                      <h3>{t("tags")}</h3>
                      <span className="muted">{selectedSubmission.tags.length}</span>
                    </div>
                    <div className="pill-row">
                      {selectedSubmission.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="tag-pill"
                          onClick={() =>
                            void updateSubmission({
                              ...selectedSubmission,
                              tags: selectedSubmission.tags.filter((item) => item !== tag),
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
                        disabled={!draftTag.trim() || saveState === "saving"}
                        onClick={() => {
                          const nextTag = draftTag.trim();
                          if (selectedSubmission.tags.includes(nextTag)) {
                            setDraftTag("");
                            return;
                          }
                          setDraftTag("");
                          void updateSubmission({
                            ...selectedSubmission,
                            tags: [...selectedSubmission.tags, nextTag],
                          });
                        }}
                      >
                        {t("addTag")}
                      </button>
                    </div>
                  </section>

                  <section className="answer-card">
                    <h3>{t("internalNotes")}</h3>
                    <textarea
                      rows={6}
                      value={notesDraft}
                      onChange={(event) => setNotesDraft(event.target.value)}
                      placeholder={t("captureReviewNotes")}
                    />
                    <button
                      type="button"
                      className="primary-button"
                      disabled={saveState === "saving"}
                      onClick={() =>
                        void updateSubmission({
                          ...selectedSubmission,
                          notes: notesDraft,
                        })
                      }
                    >
                      {t("saveNote")}
                    </button>
                  </section>

                  <section className="answer-card">
                    <h3>GitHub Prep</h3>
                    <label>
                      <span>GitHub Issue URL</span>
                      <input
                        value={githubIssueDraft}
                        onChange={(event) => setGithubIssueDraft(event.target.value)}
                        placeholder="https://github.com/org/repo/issues/123"
                      />
                    </label>
                    <label>
                      <span>GitHub PR URL</span>
                      <input
                        value={githubPrDraft}
                        onChange={(event) => setGithubPrDraft(event.target.value)}
                        placeholder="https://github.com/org/repo/pull/456"
                      />
                    </label>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={saveState === "saving"}
                      onClick={() =>
                        void updateSubmission({
                          ...selectedSubmission,
                          githubIssueUrl: githubIssueDraft,
                          githubPrUrl: githubPrDraft,
                        })
                      }
                    >
                      Save GitHub Links
                    </button>
                  </section>

                  <section className="answer-card">
                    <h3>Contributor Signal</h3>
                    <div className="metadata-list">
                      <div className="metadata-row">
                        <span>Contributor</span>
                        <strong>{shortenContributorId(selectedSubmission.contributorId)}</strong>
                      </div>
                      <div className="metadata-row">
                        <span>Contributor ID</span>
                        <strong className="blob-prominent">
                          {selectedSubmission.contributorId ?? "Not available"}
                        </strong>
                      </div>
                    </div>
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
                            <strong className="blob-prominent">{form.blobId ?? t("notAvailable")}</strong>
                            {!isLocalFallbackBlob(form.blobId) ? (
                              <BlobLink blobId={form.blobId} label={t("verifyOnWalrus")} />
                            ) : null}
                          </div>
                        </div>
                        <div className="metadata-row">
                          <span>{t("submissionBlobIdLabel")}</span>
                          <div>
                            <strong className="blob-prominent">
                              {selectedSubmission.blobId ?? t("notAvailable")}
                            </strong>
                            {!isLocalFallbackBlob(selectedSubmission.blobId) ? (
                              <BlobLink blobId={selectedSubmission.blobId} label={t("verifyOnWalrus")} />
                            ) : null}
                          </div>
                        </div>
                        <div className="metadata-row">
                          <span>{t("encryptedPayloadBlobId")}</span>
                          <div>
                            <strong className="blob-prominent">
                              {selectedSubmission.encryptedBlobId ?? t("notAvailable")}
                            </strong>
                            {!isLocalFallbackBlob(selectedSubmission.encryptedBlobId) ? (
                              <BlobLink
                                blobId={selectedSubmission.encryptedBlobId}
                                label={t("verifyOnWalrus")}
                              />
                            ) : null}
                          </div>
                        </div>
                        <div className="metadata-row">
                          <span>{t("attachmentBlobIds")}</span>
                          <div className="stack">
                            {selectedSubmission.attachments.length === 0 ? (
                              <strong>{t("notAvailable")}</strong>
                            ) : (
                              selectedSubmission.attachments.map((attachment) => (
                                <div key={attachment.blobId}>
                                  <strong className="blob-prominent">{attachment.blobId}</strong>
                                  {!isLocalFallbackBlob(attachment.blobId) ? (
                                    <BlobLink blobId={attachment.blobId} label={t("verifyOnWalrus")} />
                                  ) : null}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                        <div className="metadata-row">
                          <span>{t("storageMode")}</span>
                          <div className="stack">
                            {getStorageDetailLabels(selectedSubmission.encryptedBlobId ?? selectedSubmission.blobId).map((label) => (
                              <strong key={label}>{label}</strong>
                            ))}
                            {storageRuntime.mode === "walrus" ? <strong>{t("storageWalrus")}</strong> : null}
                          </div>
                        </div>
                        <div className="metadata-row">
                          <span>{t("sealModeLabel")}</span>
                          <strong>{sealRuntime.isFallback ? "fallback" : sealRuntime.activeMode}</strong>
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
                        encryptSubmissions={form.encryptSubmissions}
                        encryptedBlobId={selectedSubmission.encryptedBlobId}
                        canDecrypt={Boolean(account?.address)}
                        walletAccessStatus={getWalletAccessLabel(form, account?.address)}
                      />
                    ) : null}
                  </section>
                </div>
              </>
            )}
          </article>
        </div>
      </section>
    </AdminAccessGate>
  );
}
