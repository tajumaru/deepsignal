import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BlobLink } from "../components/BlobLink";
import { EmptyState } from "../components/EmptyState";
import { getSealRuntimeStatus } from "../crypto/cryptoFactory";
import { useI18n } from "../i18n";
import {
  normalizeSubmission,
  resolveSubmissionAnswers,
  storageAdapter,
} from "../lib/storage";
import { flattenAnswer, formatDate } from "../lib/utils";
import type { FormSchema, Submission } from "../types";

function subjectFromSubmission(submission: Submission) {
  return submission.subjectPreview || submission.id;
}

function proofBacked(submission: Submission) {
  return Boolean(submission.encryptedBlobId || submission.blobId);
}

function previewFromSubmission(submission: Submission) {
  if (submission.isEncrypted) {
    return "Encrypted payload ready for decryption.";
  }
  const firstValue = Object.values(submission.answers)[0];
  return flattenAnswer(firstValue) || submission.subjectPreview || submission.id;
}

export function FormSubmissionsPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const { formId = "", submissionId = "" } = useParams();
  const sealRuntime = getSealRuntimeStatus();
  const [form, setForm] = useState<FormSchema | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedId, setSelectedId] = useState(submissionId);
  const [tagFilter, setTagFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [detailAnswers, setDetailAnswers] = useState<Record<string, unknown> | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<Submission["attachments"]>([]);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState("");
  const [saving, setSaving] = useState(false);
  const [draftTag, setDraftTag] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(selectedSubmissionId?: string) {
    const [nextForm, nextSubmissionsRaw] = await Promise.all([
      storageAdapter.getForm(formId),
      storageAdapter.listSubmissions(formId),
    ]);
    const nextSubmissions = nextSubmissionsRaw.map((submission) => normalizeSubmission(submission));
    setForm(nextForm);
    setSubmissions(nextSubmissions);

    const fallbackSelectedId =
      selectedSubmissionId ??
      submissionId ??
      nextSubmissions[0]?.id ??
      "";

    setSelectedId(fallbackSelectedId);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [formId, submissionId]);

  const availableTags = useMemo(
    () =>
      [...new Set(submissions.flatMap((submission) => submission.tags))]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [submissions],
  );

  const filtered = useMemo(
    () =>
      submissions.filter((submission) => {
        if (unreadOnly && submission.status !== "unread") {
          return false;
        }
        if (priorityFilter !== "all" && submission.priority !== priorityFilter) {
          return false;
        }
        if (tagFilter !== "all" && !submission.tags.includes(tagFilter)) {
          return false;
        }
        return true;
      }),
    [priorityFilter, submissions, tagFilter, unreadOnly],
  );

  const selectedSubmission =
    filtered.find((submission) => submission.id === selectedId) ??
    submissions.find((submission) => submission.id === selectedId) ??
    filtered[0] ??
    null;

  const ratingDistribution = useMemo(() => {
    const buckets = [5, 4, 3, 2, 1].map((score) => ({
      score,
      count: submissions.filter((submission) => Math.round(submission.ratingValue ?? 0) === score)
        .length,
    }));
    const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    const average =
      total === 0
        ? 0
        : submissions.reduce((sum, submission) => sum + (submission.ratingValue ?? 0), 0) / total;
    return { buckets, total, average };
  }, [submissions]);

  useEffect(() => {
    if (!selectedSubmission) {
      setDetailAnswers(null);
      setDetailAttachments([]);
      setNotesDraft("");
      return;
    }
    setNotesDraft(selectedSubmission.notes);
    setDetailAnswers(selectedSubmission.isEncrypted ? null : selectedSubmission.answers);
    setDetailAttachments(selectedSubmission.attachments);
    setDecryptError("");
  }, [selectedSubmission]);

  useEffect(() => {
    if (!selectedSubmission || !submissionId || selectedSubmission.status !== "unread" || saving) {
      return;
    }
    void updateSubmission({ ...selectedSubmission, status: "read" });
  }, [saving, selectedSubmission, submissionId]);

  async function updateSubmission(nextSubmission: Submission) {
    setSaving(true);
    await storageAdapter.updateSubmission(nextSubmission);
    await load(nextSubmission.id);
    setSaving(false);
  }

  async function handleSelect(submission: Submission) {
    setSelectedId(submission.id);
    if (submission.status === "unread") {
      await updateSubmission({ ...submission, status: "read" });
      return;
    }
    setNotesDraft(submission.notes);
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

  return (
    <section className="stack">
      <div className="panel glow-panel inbox-hero">
        <div className="section-row">
          <div>
            <p className="eyebrow">{t("feedbackInboxEyebrow")}</p>
            <h1>{form.title}</h1>
            <p>{form.description || t("noDescription")}</p>
          </div>
          <div className="inline-actions">
            <Link className="ghost-button" to={`/f/${form.id}`}>
              {t("openPublicForm")}
            </Link>
            <span className={`pill ${form.encryptSubmissions ? "proof-pill" : ""}`}>
              {form.encryptSubmissions ? t("encryptEnabledLabel") : t("encryptDisabledLabel")}
            </span>
          </div>
        </div>

        <div className="inbox-topline">
          <div className="signal-metric">
            <span>{t("proofBacked")}</span>
            <strong>{submissions.filter(proofBacked).length}</strong>
          </div>
          <div className="signal-metric">
            <span>{t("averageRating")}</span>
            <strong>
              {ratingDistribution.total > 0
                ? ratingDistribution.average.toFixed(1)
                : t("noRatingsYet")}
            </strong>
          </div>
          <div className="signal-metric">
            <span>{t("blobId")}</span>
            <strong className="blob-prominent">{form.blobId ?? t("pending")}</strong>
            <BlobLink blobId={form.blobId} />
          </div>
        </div>

        {ratingDistribution.total > 0 ? (
          <div className="rating-distribution">
            {ratingDistribution.buckets.map((bucket) => (
              <div key={bucket.score} className="distribution-row">
                <span>{bucket.score}★</span>
                <div className="distribution-bar">
                  <div
                    className="distribution-fill"
                    style={{
                      width: `${(bucket.count / ratingDistribution.total) * 100}%`,
                    }}
                  />
                </div>
                <strong>{bucket.count}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="inbox-layout">
        <aside className="panel inbox-list-panel">
          <div className="filter-row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(event) => setUnreadOnly(event.target.checked)}
              />
              <span>{t("unreadOnly")}</span>
            </label>
            <label>
              <span>{t("priority")}</span>
              <select
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
              >
                <option value="all">{t("all")}</option>
                <option value="low">{t("priorityLow")}</option>
                <option value="medium">{t("priorityMedium")}</option>
                <option value="high">{t("priorityHigh")}</option>
              </select>
            </label>
            <label>
              <span>{t("tagFilter")}</span>
              <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                <option value="all">{t("all")}</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filtered.length === 0 ? (
            <EmptyState>
              <h2>{t("noSubmissionsView")}</h2>
              <p>{t("noSubmissionsBody")}</p>
            </EmptyState>
          ) : (
            <div className="inbox-thread-list">
              {filtered.map((submission) => (
                <button
                  key={submission.id}
                  type="button"
                  className={`inbox-thread ${selectedSubmission?.id === submission.id ? "is-active" : ""}`}
                  onClick={() => void handleSelect(submission)}
                >
                  <div className="inbox-thread-header">
                    <strong>{subjectFromSubmission(submission)}</strong>
                    <span>{formatDate(submission.createdAt)}</span>
                  </div>
                  <div className="inbox-thread-meta">
                    <span className={`pill status-${submission.status}`}>
                      {submission.status === "unread"
                        ? t("statusUnread")
                        : submission.status === "read"
                          ? t("statusRead")
                          : t("statusArchived")}
                    </span>
                    <span className={`pill priority-${submission.priority}`}>
                      {submission.priority === "low"
                        ? t("priorityLow")
                        : submission.priority === "medium"
                          ? t("priorityMedium")
                          : t("priorityHigh")}
                    </span>
                    {submission.status === "unread" ? <span className="unread-dot" /> : null}
                  </div>
                  <p className="thread-preview">
                    {submission.isEncrypted ? t("encryptedPreview") : previewFromSubmission(submission)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </aside>

        <article className="panel glow-panel inbox-detail-panel">
          {!selectedSubmission ? (
            <EmptyState>
              <h2>{t("emptySubmissionNotFound")}</h2>
            </EmptyState>
          ) : (
            <>
              <div className="section-row">
                <div>
                  <p className="eyebrow">{t("inboxDetailEyebrow")}</p>
                  <h2>{subjectFromSubmission(selectedSubmission)}</h2>
                  <p className="muted">{formatDate(selectedSubmission.createdAt)}</p>
                </div>
                <div className="inline-actions">
                  {proofBacked(selectedSubmission) ? (
                    <span className="proof-badge">{t("proofBacked")}</span>
                  ) : null}
                  <strong className="blob-prominent">
                    {selectedSubmission.encryptedBlobId ??
                      selectedSubmission.blobId ??
                      t("pending")}
                  </strong>
                </div>
              </div>

              <div className="inline-actions">
                {selectedSubmission.isEncrypted ? (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void handleDecrypt()}
                    disabled={decrypting}
                  >
                    {decrypting ? t("decrypting") : t("decrypt")}
                  </button>
                ) : null}
                <BlobLink
                  blobId={selectedSubmission.encryptedBlobId ?? selectedSubmission.blobId}
                />
              </div>

              {selectedSubmission.isEncrypted &&
              sealRuntime.activeMode === "seal" &&
              !detailAnswers &&
              !account?.address ? (
                <p className="warning-text">{t("sealDecryptWalletPrompt")}</p>
              ) : null}

              {selectedSubmission.isEncrypted &&
              sealRuntime.activeMode === "seal" &&
              !detailAnswers &&
              account?.address ? (
                <p className="muted">{t("sealDecryptApprovalPrompt")}</p>
              ) : null}

              {decryptError ? (
                <p
                  className={
                    decryptError.includes("wallet approval") ? "warning-text" : "error-text"
                  }
                >
                  {decryptError}
                </p>
              ) : null}

              <div className="grid detail-shell">
                <div className="stack">
                  <section className="answer-card">
                    <h3>{t("messageContent")}</h3>
                    {detailAnswers ? (
                      <div className="stack">
                        {form.fields.map((field) => (
                          <div key={field.id} className="answer-line">
                            <strong>{field.label}</strong>
                            <p>{flattenAnswer(detailAnswers[field.id]) || t("noAnswer")}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">{t("encryptedBodyHidden")}</p>
                    )}
                  </section>

                  <section className="answer-card">
                    <h3>{t("attachments")}</h3>
                    {detailAttachments.length === 0 ? (
                      <p className="muted">{t("noUploadedMedia")}</p>
                    ) : (
                      detailAttachments.map((attachment) => (
                        <div key={attachment.blobId} className="attachment-row">
                          <div>
                            <strong>{attachment.name}</strong>
                            <p className="muted">
                              {attachment.type} · {Math.round(attachment.size / 1024)} {t("kb")}
                            </p>
                          </div>
                          <div className="stack">
                            <strong className="blob-prominent">{attachment.blobId}</strong>
                            <BlobLink blobId={attachment.blobId} />
                          </div>
                        </div>
                      ))
                    )}
                  </section>
                </div>

                <aside className="stack">
                  <section className="answer-card">
                    <h3>{t("workflowControls")}</h3>
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
                        disabled={saving}
                      >
                        <option value="unread">{t("statusUnread")}</option>
                        <option value="read">{t("statusRead")}</option>
                        <option value="archived">{t("statusArchived")}</option>
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
                        disabled={saving}
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
                        disabled={!draftTag.trim() || saving}
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
                      rows={8}
                      value={notesDraft}
                      onChange={(event) => setNotesDraft(event.target.value)}
                      placeholder={t("notePlaceholder")}
                    />
                    <button
                      type="button"
                      className="primary-button"
                      disabled={saving}
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
                </aside>
              </div>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
