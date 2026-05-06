import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { BlobLink } from "../components/BlobLink";
import { EmptyState } from "../components/EmptyState";
import { SealStatusCard } from "../components/SealStatusCard";
import { getSealRuntimeStatus } from "../crypto/cryptoFactory";
import { useI18n } from "../i18n";
import { addressesMatch } from "../lib/adminAccess";
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
import { shortAddress } from "../lib/sui";
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

  useEffect(() => {
    void loadConsole();
  }, []);

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

  const accessibleForms = useMemo(
    () =>
      forms.filter(
        (form) => !form.ownerAddress || addressesMatch(form.ownerAddress, account?.address),
      ),
    [account?.address, forms],
  );

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

  async function updateSubmission(nextSubmission: Submission) {
    setSaving(true);
    await storageAdapter.updateSubmission(nextSubmission);
    await loadConsole(nextSubmission.id);
    setSaving(false);
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
      setDecryptError(error instanceof Error ? error.message : "Decrypt failed.");
    } finally {
      setDecrypting(false);
    }
  }

  const streamItems = [
    { id: "all", label: "All Signals", count: allSignals.length },
    {
      id: "unread",
      label: "Unread",
      count: allSignals.filter((record) => record.submission.status === "unread").length,
    },
    {
      id: "encrypted",
      label: "Encrypted",
      count: allSignals.filter((record) => record.submission.isEncrypted).length,
    },
    {
      id: "high",
      label: "High Priority",
      count: allSignals.filter((record) => record.submission.priority === "high").length,
    },
    {
      id: "bug",
      label: "Bug Reports",
      count: allSignals.filter((record) => record.category === "Bug").length,
    },
    {
      id: "feature",
      label: "Feature Requests",
      count: allSignals.filter((record) => record.category === "Feature").length,
    },
    {
      id: "archived",
      label: "Archived",
      count: allSignals.filter((record) => record.submission.status === "archived").length,
    },
  ] satisfies Array<{ id: StreamId; label: string; count: number }>;

  if (loading) {
    return <div className="panel">{t("loadingResearchLab")}</div>;
  }

  return (
    <AdminAccessGate hasWallet={Boolean(account?.address)} access="allowed">
      <section className="stack">
        <div className="panel glow-panel inbox-shell-header">
          <div>
            <p className="eyebrow">Creator-only Inbox</p>
            <h1>Signal Inbox</h1>
            <p className="lede">
              DeepSignal review console for encrypted creator feedback across every accessible
              signal form.
            </p>
          </div>
          <div className="inbox-header-actions">
            <div className="inbox-status-chip">
              Wallet Verified: {account?.address ? shortAddress(account.address) : "Not connected"}
            </div>
            <Link className="primary-button" to="/admin/forms/new">
              Create Signal Form
            </Link>
          </div>
        </div>

        <div className="mobile-console-banner">
          DeepSignal review console is optimized for desktop.
        </div>

        {accessibleForms.length === 0 ? (
          <EmptyState>
            <h2>No creator-owned inboxes found</h2>
            <p>Connect the creator wallet or create a new signal form to open your inbox.</p>
            <Link className="primary-button" to="/admin/forms/new">
              Create Signal Form
            </Link>
          </EmptyState>
        ) : (
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

              <div className="signal-sidebar-section">
                <div className="section-row">
                  <p className="eyebrow">Forms</p>
                  <span className="muted">{accessibleForms.length}</span>
                </div>
                <div className="form-stream-list">
                  <button
                    type="button"
                    className={`form-stream-item ${selectedFormId === "all" ? "is-active" : ""}`}
                    onClick={() => setSelectedFormId("all")}
                  >
                    <div>
                      <strong>All Forms</strong>
                      <p className="muted">Cross-form Signal Inbox</p>
                    </div>
                  </button>
                  {accessibleForms.map((form) => (
                    <div
                      key={form.id}
                      className={`form-stream-item ${selectedFormId === form.id ? "is-active" : ""}`}
                    >
                      <button
                        type="button"
                        className="form-stream-select"
                        onClick={() => setSelectedFormId(form.id)}
                      >
                        <div>
                          <strong>{form.title}</strong>
                          <p className="muted">
                            {form.submissionCount} signals
                            {form.ownerAddress ? "" : " · Legacy demo form"}
                          </p>
                        </div>
                      </button>
                      <div className="form-stream-actions">
                        <Link className="ghost-button" to={`/f/${form.id}`}>
                          Open
                        </Link>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => void handleDelete(form.id)}
                          disabled={deletingFormId === form.id}
                        >
                          {deletingFormId === form.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="signal-sidebar-section stack">
                <Link className="primary-button" to="/admin/forms/new">
                  Create Signal Form
                </Link>
                <div className="wallet-status-card">
                  <p className="eyebrow">Wallet status</p>
                  <strong>{account?.address ? "Wallet Verified" : "Not connected"}</strong>
                  <p className="muted">
                    {account?.address ? shortAddress(account.address) : "Connect wallet to review signals."}
                  </p>
                </div>
              </div>
            </aside>

            <section className="panel signal-inbox-column">
              <div className="signal-column-header">
                <div>
                  <p className="eyebrow">Signal Inbox</p>
                  <h2>{streamItems.find((stream) => stream.id === selectedStreamId)?.label}</h2>
                  <p className="muted">
                    {visibleSignals.filter((record) => record.submission.status === "unread").length} unread
                    · {selectedFormId === "all"
                      ? "All forms"
                      : accessibleForms.find((form) => form.id === selectedFormId)?.title ?? "Selected form"}
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
                  <p>Adjust the selected stream or search for another signal.</p>
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
                            <span className="signal-chip">Rating {submission.ratingValue}</span>
                          ) : null}
                          <span className="signal-chip">
                            {submission.attachments.length}{" "}
                            {submission.attachments.length === 1 ? "attachment" : "attachments"}
                          </span>
                          {submission.isEncrypted ? (
                            <span className="signal-chip signal-chip-accent">Encrypted Signal</span>
                          ) : null}
                          <span className="signal-chip">{storageLabel}</span>
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
              {!selectedRecord ? (
                <EmptyState>
                  <h2>Select a signal to review</h2>
                  <p>Incoming encrypted feedback will appear here.</p>
                </EmptyState>
              ) : (
                <>
                  <div className="signal-detail-heading">
                    <div>
                      <p className="eyebrow">Signal Detail</p>
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
                        Open form inbox
                      </Link>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() =>
                          exportSubmissionJson(selectedRecord.form, selectedRecord.submission)
                        }
                      >
                        Export JSON
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
                      Rating {selectedRecord.submission.ratingValue ?? "Not available"}
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
                        {decrypting ? "Decrypting..." : "Decrypt Signal"}
                      </button>
                      {!isLocalFallbackBlob(selectedRecord.submission.encryptedBlobId) ? (
                        <BlobLink
                          blobId={selectedRecord.submission.encryptedBlobId}
                          label="Verify on Walrus"
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {selectedRecord.submission.isEncrypted && !detailAnswers ? (
                    <p className="muted">
                      {sealRuntime.activeMode === "mock"
                        ? "Demo decrypt available."
                        : "Policy-gated Decryption. Wallet approval required."}
                    </p>
                  ) : null}

                  {decryptError ? (
                    <p className="warning-text">{decryptError}</p>
                  ) : null}

                  <div className="signal-detail-sections">
                    <section className="answer-card">
                      <h3>Answers</h3>
                      {detailAnswers ? (
                        <div className="stack">
                          {selectedRecord.form.fields.map((field) => (
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
                                <span className="blob-prominent">{attachment.blobId}</span>
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
                          value={selectedRecord.submission.status}
                          onChange={(event) =>
                            void updateSubmission({
                              ...selectedRecord.submission,
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
                          value={selectedRecord.submission.priority}
                          onChange={(event) =>
                            void updateSubmission({
                              ...selectedRecord.submission,
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
                          placeholder="Add tag"
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
                            ...selectedRecord.submission,
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
                            <strong className="blob-prominent">
                              {selectedRecord.form.blobId ?? "Not available"}
                            </strong>
                            {!isLocalFallbackBlob(selectedRecord.form.blobId) ? (
                              <BlobLink blobId={selectedRecord.form.blobId} label="Verify on Walrus" />
                            ) : null}
                          </div>
                        </div>
                        <div className="metadata-row">
                          <span>Submission Blob ID</span>
                          <div>
                            <strong className="blob-prominent">
                              {selectedRecord.submission.blobId ?? "Not available"}
                            </strong>
                            {!isLocalFallbackBlob(selectedRecord.submission.blobId) ? (
                              <BlobLink
                                blobId={selectedRecord.submission.blobId}
                                label="Verify on Walrus"
                              />
                            ) : null}
                          </div>
                        </div>
                        <div className="metadata-row">
                          <span>Encrypted Payload Blob ID</span>
                          <div>
                            <strong className="blob-prominent">
                              {selectedRecord.submission.encryptedBlobId ?? "Not available"}
                            </strong>
                            {!isLocalFallbackBlob(selectedRecord.submission.encryptedBlobId) ? (
                              <BlobLink
                                blobId={selectedRecord.submission.encryptedBlobId}
                                label="Verify on Walrus"
                              />
                            ) : null}
                          </div>
                        </div>
                        <div className="metadata-row">
                          <span>Attachment Blob IDs</span>
                          <div className="stack">
                            {selectedRecord.submission.attachments.length === 0 ? (
                              <strong>Not available</strong>
                            ) : (
                              selectedRecord.submission.attachments.map((attachment) => (
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
                          <strong>
                            {getWalletAccessLabel(selectedRecord.form, account?.address)}
                          </strong>
                        </div>
                      </div>
                    </section>

                    <SealStatusCard
                      encryptSubmissions={selectedRecord.form.encryptSubmissions}
                      encryptedBlobId={selectedRecord.submission.encryptedBlobId}
                      canDecrypt={Boolean(account?.address)}
                      walletAccessStatus={getWalletAccessLabel(selectedRecord.form, account?.address)}
                    />

                    <section className="answer-card">
                      <div className="section-row">
                        <div>
                          <p className="eyebrow">Form Actions</p>
                          <h3>{selectedRecord.form.title}</h3>
                        </div>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => void handleDelete(selectedRecord.form.id)}
                          disabled={deletingFormId === selectedRecord.form.id}
                        >
                          {deletingFormId === selectedRecord.form.id ? "Deleting..." : "Delete form"}
                        </button>
                      </div>
                      <div className="inline-actions">
                        <Link className="ghost-button" to={`/f/${selectedRecord.form.id}`}>
                          Open public form
                        </Link>
                        <Link className="ghost-button" to={`/dashboard/forms/${selectedRecord.form.id}`}>
                          Review form inbox
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
    </AdminAccessGate>
  );
}
