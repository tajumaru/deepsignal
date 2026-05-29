import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import "../styles/components/metadata-proof.css";
import "../styles/pages/public-flows.css";
import "../styles/mobile/layout.css";
import "../styles/mobile/workspace.css";
import "../styles/mobile/signal.css";
import { FormattedAnswerValue } from "../components/FormattedAnswerValue";
import { SignalMetaRow } from "../components/SignalMetaChip";
import { useSuiWallet } from "../hooks/useSuiWallet";
import { normalizeSubmission, storageAdapter } from "../lib/storage";
import { formatDate } from "../lib/utils";
import {
  listSubmittedHistory,
  requestSubmittedHistoryRevoke,
  type SubmittedHistoryEntry,
} from "../storage/submittedHistory";
import type { FormField, Submission } from "../types";

function getEntryTitle(entry: SubmittedHistoryEntry) {
  return entry.formTitle || entry.title || `Signal ${entry.submissionId.slice(0, 8)}`;
}

function getStorageLabel(entry: SubmittedHistoryEntry) {
  if (entry.submissionBlobId?.startsWith("local-")) {
    return "Local fallback";
  }
  return entry.storageMode === "walrus" ? "Walrus" : entry.storageMode;
}

function getEntryFormVersion(entry: SubmittedHistoryEntry) {
  return entry.formVersion ?? entry.snapshot?.formVersion ?? 1;
}

function getEntrySchemaHash(entry: SubmittedHistoryEntry) {
  return entry.schemaHash ?? entry.snapshot?.schemaHash;
}

function getEntryFormBlobId(entry: SubmittedHistoryEntry) {
  return entry.formBlobId ?? entry.snapshot?.formBlobId;
}

async function markLocalOwnerSubmissionRevoke(entry: SubmittedHistoryEntry, revokeReason?: string) {
  try {
    const forms = await storageAdapter.listForms();
    const matchingForms = forms.filter(
      (form) =>
        form.id === entry.formId ||
        (entry.ownerProjectId && form.projectId === entry.ownerProjectId) ||
        (entry.manifestBlobId && form.manifestBlobId === entry.manifestBlobId),
    );
    for (const form of matchingForms) {
      const submissions = await storageAdapter.listSubmissions(form.id);
      const match = submissions
        .map((submission) => normalizeSubmission(submission))
        .find((submission) => submission.id === entry.submissionId);
      if (!match) {
        continue;
      }
      const nextSubmission: Submission = {
        ...match,
        revokeRequested: true,
        revokeRequestedAt: new Date().toISOString(),
        revokeReason: revokeReason?.trim() || match.revokeReason,
        updatedAt: new Date().toISOString(),
      };
      await storageAdapter.updateSubmission(nextSubmission);
      return;
    }
  } catch (error) {
    console.warn("[submitted history] failed to mirror revoke request into local owner cache", error);
  }
}

export function SubmittedHistoryPage() {
  const { submissionId = "" } = useParams();
  const walletAddress = useSuiWallet().accountAddress;
  const [entries, setEntries] = useState<SubmittedHistoryEntry[]>(() => listSubmittedHistory(walletAddress));
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeStatus, setRevokeStatus] = useState("");
  const selectedEntry = useMemo(
    () => (submissionId ? entries.find((entry) => entry.submissionId === submissionId) ?? null : null),
    [entries, submissionId],
  );

  useEffect(() => {
    setEntries(listSubmittedHistory(walletAddress));
  }, [walletAddress]);

  if (submissionId && !selectedEntry) {
    return <Navigate to="/submitted" replace />;
  }

  if (selectedEntry) {
    const fieldsById = new Map((selectedEntry.snapshot?.fields ?? []).map((field) => [field.id, field]));
    const answerEntries = Object.entries(selectedEntry.snapshot?.answers ?? {});
    const isAnonymous = selectedEntry.identity?.kind !== "wallet";

    async function handleRequestRevoke() {
      if (!selectedEntry) {
        return;
      }
      const result = requestSubmittedHistoryRevoke({
        submissionId: selectedEntry.submissionId,
        walletAddress,
        revokeReason,
      });
      if (!result) {
        setRevokeStatus("Could not record the revoke request on this device.");
        return;
      }
      await markLocalOwnerSubmissionRevoke(selectedEntry, revokeReason);
      setEntries(listSubmittedHistory(walletAddress));
      setRevokeStatus("Revoke request recorded. Existing Walrus blobs are not deleted.");
    }

    return (
      <section className="stack submitted-history-page">
        <div className="panel glow-panel submitted-history-hero">
          <div>
            <p className="eyebrow">Submitted signal receipt</p>
            <h1>{getEntryTitle(selectedEntry)}</h1>
            <p className="lede">
              This is a read-only view of the signal receipt saved on this device.
            </p>
          </div>
          <Link to="/submitted" className="ghost-button">
            Back to submitted history
          </Link>
        </div>

        <section className="answer-card">
          <div className="metadata-list">
            <div className="metadata-row">
              <span>Status</span>
              <strong>{selectedEntry.revokeRequested ? "Revoke requested" : "Active"}</strong>
            </div>
            <div className="metadata-row">
              <span>Submitted</span>
              <strong>{formatDate(selectedEntry.submittedAt)}</strong>
            </div>
            <div className="metadata-row">
              <span>Identity</span>
              <strong>{isAnonymous ? "Anonymous local device" : "Wallet-linked local receipt"}</strong>
            </div>
            <div className="metadata-row">
              <span>Storage</span>
              <strong>{getStorageLabel(selectedEntry)}</strong>
            </div>
            <div className="metadata-row">
              <span>Form version</span>
              <strong>v{getEntryFormVersion(selectedEntry)}</strong>
            </div>
            {getEntrySchemaHash(selectedEntry) ? (
              <div className="metadata-row">
                <span>Schema hash</span>
                <strong>{getEntrySchemaHash(selectedEntry)}</strong>
              </div>
            ) : null}
            <SignalMetaRow label="Form blob" type="blob" value={getEntryFormBlobId(selectedEntry)} emptyLabel="Not available" />
            <SignalMetaRow label="Manifest" type="manifest" value={selectedEntry.manifestBlobId} emptyLabel="Not available" />
            <SignalMetaRow label="Submission blob" type="blob" value={selectedEntry.submissionBlobId} emptyLabel="Not available" />
            {selectedEntry.ownerProjectId ? (
              <div className="metadata-row">
                <span>Owner project</span>
                <strong>{selectedEntry.ownerProjectId}</strong>
              </div>
            ) : null}
            {selectedEntry.revokeRequestedAt ? (
              <div className="metadata-row">
                <span>Revoke requested at</span>
                <strong>{formatDate(selectedEntry.revokeRequestedAt)}</strong>
              </div>
            ) : null}
          </div>
        </section>

        <section className="answer-card">
          <div className="section-row">
            <div>
              <p className="eyebrow">Read-only answers</p>
              <h2>Submitted content</h2>
            </div>
          </div>
          {answerEntries.length > 0 ? (
            <div className="stack">
              {answerEntries.map(([fieldId, value], index) => {
                const field = fieldsById.get(fieldId) as FormField | undefined;
                return (
                  <div key={fieldId} className="answer-line" data-question-index={`Q${index + 1}`}>
                    <strong>{field?.label ?? fieldId}</strong>
                    <FormattedAnswerValue field={field} value={value} emptyLabel="No answer" showCountryIso />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted">No answer body was stored in this local receipt.</p>
          )}
        </section>

        <section className="answer-card submitted-revoke-card">
          <div>
            <p className="eyebrow">Revoke request</p>
            <h2>{selectedEntry.revokeRequested ? "Revoke requested" : "Request revoke"}</h2>
            <p className="muted">
              This records a revoke request for operators. It does not delete existing Walrus blobs or rewrite immutable evidence.
            </p>
          </div>
          {selectedEntry.revokeRequested ? (
            <p className="warning-text">Revoke requested on this device.</p>
          ) : (
            <>
              <label className="field-shell">
                <span>Reason optional</span>
                <textarea
                  value={revokeReason}
                  onChange={(event) => setRevokeReason(event.target.value)}
                  placeholder="Add context for the owner, if useful."
                />
              </label>
              <button type="button" className="primary-button" onClick={() => void handleRequestRevoke()}>
                Request revoke
              </button>
            </>
          )}
          {revokeStatus ? <p className="muted">{revokeStatus}</p> : null}
        </section>
      </section>
    );
  }

  return (
    <section className="stack submitted-history-page">
      <div className="panel glow-panel submitted-history-hero">
        <div>
          <p className="eyebrow">Submitted history</p>
          <h1>My submitted signals</h1>
          <p className="lede">
            Review receipts and read-only answer snapshots saved after successful signal transmission.
          </p>
        </div>
      </div>

      <section className="answer-card submitted-privacy-card">
        <p>
          Anonymous submission history is stored only in this browser localStorage. If localStorage is cleared, the
          history cannot be restored. Wallet-linked receipts use a separated local index so they can later grow into a
          wallet-linked submitted index.
        </p>
      </section>

      {entries.length === 0 ? (
        <section className="answer-card">
          <p className="eyebrow">No local receipts</p>
          <h2>No submitted signals on this device</h2>
          <p className="muted">Submit a signal successfully from a public form and its receipt will appear here.</p>
          <Link to="/explore" className="primary-button">
            Return to Signals
          </Link>
        </section>
      ) : (
        <div className="submitted-history-list">
          {entries.map((entry) => (
            <Link key={entry.submissionId} to={`/submitted/${entry.submissionId}`} className="answer-card submitted-history-row">
              <div>
                <p className="eyebrow">{entry.revokeRequested ? "Revoke requested" : "Active"}</p>
                <h2>{getEntryTitle(entry)}</h2>
                <p className="muted">{formatDate(entry.submittedAt)}</p>
              </div>
              <div className="submitted-history-row-meta">
                <span>{getStorageLabel(entry)}</span>
                <span>v{getEntryFormVersion(entry)}</span>
                <strong>{entry.submissionId.slice(0, 12)}</strong>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
