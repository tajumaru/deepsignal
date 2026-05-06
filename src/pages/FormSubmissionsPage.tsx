import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { BlobLink } from "../components/BlobLink";
import { EmptyState } from "../components/EmptyState";
import { SealStatusCard } from "../components/SealStatusCard";
import { getSealRuntimeStatus } from "../crypto/cryptoFactory";
import { useI18n } from "../i18n";
import { getFormAccessState } from "../lib/adminAccess";
import { exportSubmissionJson, exportSubmissionsCsv } from "../lib/export";
import {
  getSignalPreview,
  getSignalSubject,
  getWalletAccessLabel,
  inferSignalCategory,
  isLocalFallbackBlob,
} from "../lib/signalInbox";
import {
  normalizeSubmission,
  resolveSubmissionAnswers,
  storageAdapter,
} from "../lib/storage";
import { formatDate, flattenAnswer } from "../lib/utils";
import { getStorageRuntimeStatus } from "../storage/storageFactory";
import type { FormSchema, Submission } from "../types";

type StreamId =
  | "all"
  | "unread"
  | "encrypted"
  | "high"
  | "bug"
  | "feature"
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
    case "bug":
      return category === "Bug";
    case "feature":
      return category === "Feature";
    case "archived":
      return submission.status === "archived";
    default:
      return true;
  }
}

export function FormSubmissionsPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
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
  const [saving, setSaving] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [draftTag, setDraftTag] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadInbox();
  }, [formId]);

  async function loadInbox(preferredSignalId?: string) {
    const [nextForm, rawSubmissions] = await Promise.all([
      storageAdapter.getForm(formId),
      storageAdapter.listSubmissions(formId),
    ]);
    setForm(nextForm);
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
      setDecryptError("");
      return;
    }
    setNotesDraft(selectedSubmission.notes);
    setDetailAnswers(selectedSubmission.isEncrypted ? null : selectedSubmission.answers);
    setDetailAttachments(selectedSubmission.attachments ?? []);
    setDecryptError("");
  }, [selectedSubmission]);

  async function updateSubmission(nextSubmission: Submission) {
    setSaving(true);
    await storageAdapter.updateSubmission(nextSubmission);
    await loadInbox(nextSubmission.id);
    setSaving(false);
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
      setDecryptError(error instanceof Error ? error.message : "Decrypt failed.");
    } finally {
      setDecrypting(false);
    }
  }

  const streamItems = [
    { id: "all", label: "All Signals", count: submissions.length },
    {
      id: "unread",
      label: "Unread",
      count: submissions.filter((submission) => submission.status === "unread").length,
    },
    {
      id: "encrypted",
      label: "Encrypted",
      count: submissions.filter((submission) => submission.isEncrypted).length,
    },
    {
      id: "high",
      label: "High Priority",
      count: submissions.filter((submission) => submission.priority === "high").length,
    },
    {
      id: "bug",
      label: "Bug Reports",
      count: submissions.filter((submission) => inferSignalCategory(submission) === "Bug").length,
    },
    {
      id: "feature",
      label: "Feature Requests",
      count: submissions.filter((submission) => inferSignalCategory(submission) === "Feature").length,
    },
    {
      id: "archived",
      label: "Archived",
      count: submissions.filter((submission) => submission.status === "archived").length,
    },
  ] satisfies Array<{ id: StreamId; label: string; count: number }>;

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

  const access = getFormAccessState(form, account?.address);

  return (
    <AdminAccessGate
      hasWallet={Boolean(account?.address)}
      access={access}
      legacyMessage="Legacy demo form. ownerAddress is missing, so development review access remains enabled."
    >
      <section className="stack">
        <div className="panel glow-panel inbox-shell-header">
          <div>
            <p className="eyebrow">Creator-only Inbox</p>
            <h1>{form.title}</h1>
            <p className="lede">{form.description || "Encrypted signal review for this form."}</p>
          </div>
          <div className="inbox-header-actions">
            <Link className="ghost-button" to="/admin">
              All inboxes
            </Link>
            <Link className="primary-button" to={`/f/${form.id}`}>
              Open public form
            </Link>
          </div>
        </div>

        <div className="mobile-console-banner">
          DeepSignal review console is optimized for desktop.
        </div>

        <div className="signal-console-layout">
          <aside className="panel signal-sidebar">
            <div className="signal-sidebar-section">
              <p className="eyebrow">Signal Streams</p>
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
                <p className="eyebrow">Wallet status</p>
                <strong>{getWalletAccessLabel(form, account?.address)}</strong>
                <p className="muted">
                  {form.ownerAddress ?? "Legacy demo form"}
                </p>
              </div>

              <div className="wallet-status-card">
                <p className="eyebrow">Form Blob ID</p>
                <strong className="blob-prominent">{form.blobId ?? "Not available"}</strong>
                {!isLocalFallbackBlob(form.blobId) ? (
                  <BlobLink blobId={form.blobId} label="Verify on Walrus" />
                ) : null}
              </div>

              <button
                type="button"
                className="ghost-button"
                onClick={() => exportSubmissionsCsv(form, submissions)}
                disabled={submissions.length === 0}
              >
                Export CSV
              </button>
            </div>
          </aside>

          <section className="panel signal-inbox-column">
            <div className="signal-column-header">
              <div>
                <p className="eyebrow">Signal Inbox</p>
                <h2>{streamItems.find((stream) => stream.id === selectedStreamId)?.label}</h2>
                <p className="muted">
                  {visibleSignals.filter((submission) => submission.status === "unread").length} unread
                  · {submissions.length} total
                </p>
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search signals, answers, or tags"
              />
            </div>

            {visibleSignals.length === 0 ? (
              <EmptyState>
                <h2>No signals in this stream</h2>
                <p>New encrypted feedback will appear here.</p>
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
                        {typeof submission.ratingValue === "number" ? (
                          <span className="signal-chip">Rating {submission.ratingValue}</span>
                        ) : null}
                        <span className="signal-chip">
                          {submission.attachments.length}{" "}
                          {submission.attachments.length === 1 ? "attachment" : "attachments"}
                        </span>
                        {submission.isEncrypted ? (
                          <span className="signal-chip signal-chip-accent">Encrypted Signal</span>
                        ) : null}
                        <span className="signal-chip">
                          {isLocalFallbackBlob(submission.encryptedBlobId ?? submission.blobId)
                            ? "Local fallback"
                            : "Stored on Walrus"}
                        </span>
                        {submission.status === "unread" ? (
                          <span className="signal-chip signal-chip-accent">New Signal</span>
                        ) : null}
                        {submission.priority === "high" ? (
                          <span className="signal-chip signal-chip-warn">High Priority</span>
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
                <h2>Select a signal to review</h2>
                <p>Incoming encrypted feedback will appear here.</p>
              </EmptyState>
            ) : (
              <>
                <div className="signal-detail-heading">
                  <div>
                    <p className="eyebrow">Signal Detail</p>
                    <h2>{getSignalSubject(selectedSubmission)}</h2>
                    <p className="muted">{formatDate(selectedSubmission.createdAt)}</p>
                  </div>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => exportSubmissionJson(form, selectedSubmission)}
                    >
                      Export JSON
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
                  <span className="pill">{inferSignalCategory(selectedSubmission)}</span>
                  <span className="pill">
                    Rating {selectedSubmission.ratingValue ?? "Not available"}
                  </span>
                </div>

                {selectedSubmission.isEncrypted ? (
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void handleDecrypt()}
                      disabled={decrypting}
                    >
                      {decrypting ? "Decrypting..." : "Decrypt Signal"}
                    </button>
                    {!isLocalFallbackBlob(selectedSubmission.encryptedBlobId) ? (
                      <BlobLink
                        blobId={selectedSubmission.encryptedBlobId}
                        label="Verify on Walrus"
                      />
                    ) : null}
                  </div>
                ) : null}

                {selectedSubmission.isEncrypted && !detailAnswers ? (
                  <p className="muted">
                    {sealRuntime.activeMode === "mock"
                      ? "Demo decrypt available."
                      : "Policy-gated Decryption. Wallet approval required."}
                  </p>
                ) : null}

                {decryptError ? <p className="warning-text">{decryptError}</p> : null}

                <div className="signal-detail-sections">
                  <section className="answer-card">
                    <h3>Answers</h3>
                    {detailAnswers ? (
                      <div className="stack">
                        {form.fields.map((field) => (
                          <div key={field.id} className="answer-line">
                            <strong>{field.label}</strong>
                            <p>{flattenAnswer(detailAnswers[field.id]) || "No answer"}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">Encrypted feedback body is hidden until decryption succeeds.</p>
                    )}
                  </section>

                  <section className="answer-card">
                    <h3>Attachments</h3>
                    {detailAttachments.length === 0 ? (
                      <p className="muted">No attachments</p>
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
                                <BlobLink blobId={attachment.blobId} label="Verify on Walrus" />
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="answer-card">
                    <h3>Review Controls</h3>
                    <label>
                      <span>Status</span>
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
                        <option value="unread">Unread</option>
                        <option value="read">Read</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                    <label>
                      <span>Priority</span>
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
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                  </section>

                  <section className="answer-card">
                    <div className="section-row">
                      <h3>Tags</h3>
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
                        placeholder="Add tag"
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
                        Add tag
                      </button>
                    </div>
                  </section>

                  <section className="answer-card">
                    <h3>Notes</h3>
                    <textarea
                      rows={6}
                      value={notesDraft}
                      onChange={(event) => setNotesDraft(event.target.value)}
                      placeholder="Capture review notes"
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
                      Save note
                    </button>
                  </section>

                  <section className="answer-card">
                    <h3>Signal Metadata</h3>
                    <div className="metadata-list">
                      <div className="metadata-row">
                        <span>Form Blob ID</span>
                        <div>
                          <strong className="blob-prominent">{form.blobId ?? "Not available"}</strong>
                          {!isLocalFallbackBlob(form.blobId) ? (
                            <BlobLink blobId={form.blobId} label="Verify on Walrus" />
                          ) : null}
                        </div>
                      </div>
                      <div className="metadata-row">
                        <span>Submission Blob ID</span>
                        <div>
                          <strong className="blob-prominent">
                            {selectedSubmission.blobId ?? "Not available"}
                          </strong>
                          {!isLocalFallbackBlob(selectedSubmission.blobId) ? (
                            <BlobLink blobId={selectedSubmission.blobId} label="Verify on Walrus" />
                          ) : null}
                        </div>
                      </div>
                      <div className="metadata-row">
                        <span>Encrypted Payload Blob ID</span>
                        <div>
                          <strong className="blob-prominent">
                            {selectedSubmission.encryptedBlobId ?? "Not available"}
                          </strong>
                          {!isLocalFallbackBlob(selectedSubmission.encryptedBlobId) ? (
                            <BlobLink
                              blobId={selectedSubmission.encryptedBlobId}
                              label="Verify on Walrus"
                            />
                          ) : null}
                        </div>
                      </div>
                      <div className="metadata-row">
                        <span>Attachment Blob IDs</span>
                        <div className="stack">
                          {selectedSubmission.attachments.length === 0 ? (
                            <strong>Not available</strong>
                          ) : (
                            selectedSubmission.attachments.map((attachment) => (
                              <div key={attachment.blobId}>
                                <strong className="blob-prominent">{attachment.blobId}</strong>
                                {!isLocalFallbackBlob(attachment.blobId) ? (
                                  <BlobLink blobId={attachment.blobId} label="Verify on Walrus" />
                                ) : null}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="metadata-row">
                        <span>Storage mode</span>
                        <strong>
                          {storageRuntime.mode === "walrus" ? "Walrus" : "Local fallback"}
                        </strong>
                      </div>
                      <div className="metadata-row">
                        <span>Seal mode</span>
                        <strong>{sealRuntime.isFallback ? "fallback" : sealRuntime.activeMode}</strong>
                      </div>
                      <div className="metadata-row">
                        <span>Wallet Access Status</span>
                        <strong>{getWalletAccessLabel(form, account?.address)}</strong>
                      </div>
                    </div>
                  </section>

                  <SealStatusCard
                    encryptSubmissions={form.encryptSubmissions}
                    encryptedBlobId={selectedSubmission.encryptedBlobId}
                    canDecrypt={Boolean(account?.address)}
                    walletAccessStatus={getWalletAccessLabel(form, account?.address)}
                  />
                </div>
              </>
            )}
          </article>
        </div>
      </section>
    </AdminAccessGate>
  );
}
