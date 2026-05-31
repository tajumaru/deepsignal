import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import "../styles/pages/public-flows.css";
import "../styles/mobile/layout.css";
import "../styles/mobile/public-form.css";
import { ContestGuidedFlow } from "../components/ContestGuidedFlow";
import { EmptyState } from "../components/EmptyState";
import { RichTextContent } from "../components/RichText";
import { getPublicFormPath } from "../lib/publicLinks";
import { PublicSignalMetaRow } from "../components/PublicSignalMeta";
import { getSubmissionRespondentMeta } from "../lib/respondentMeta";
import { PUBLIC_ROADMAP_TRIAGE_STATUSES, getTriageStatusLabel } from "../lib/signalOps";
import { normalizeForm } from "../lib/formSchema";
import { flattenAnswer, formatDate } from "../lib/utils";
import { localStorageAdapter } from "../storage/localStorageAdapter";
import { listMyResponseHistory } from "../storage/myResponseHistory";
import type { FormSchema, Submission } from "../types";

const ROADMAP_GROUPS = [
  { key: "planned", label: "Planned Signals" },
  { key: "in_progress", label: "In Progress" },
  { key: "fixed", label: "Fixed Signals" },
] as const;

function getRoadmapLifecycleLabel(triageStatus: Submission["triageStatus"]) {
  switch (triageStatus) {
    case "planned":
      return "Lifecycle: planned";
    case "in_progress":
      return "Lifecycle: in progress";
    case "fixed":
      return "Lifecycle: fixed";
    default:
      return "Lifecycle: internal review";
  }
}

function getRoadmapEmptyCopy(groupKey: (typeof ROADMAP_GROUPS)[number]["key"]) {
  switch (groupKey) {
    case "planned":
      return "No planned signals yet. Signals appear here after operators accept them into the roadmap.";
    case "in_progress":
      return "No signals are in progress yet. This lane updates when reviewed signals move into active work.";
    case "fixed":
      return "No fixed signals yet. Completed work appears here after operators mark signals fixed.";
    default:
      return "No signals published in this lane yet.";
  }
}

function getPublicSignalPreview(submission: Submission) {
  if (submission.isEncrypted) {
    return "Encrypted Signal";
  }
  for (const value of Object.values(submission.answers ?? {})) {
    const preview = flattenAnswer(value).trim();
    if (preview) {
      return preview;
    }
  }
  return submission.subjectPreview?.trim() || `Signal ${submission.id.slice(0, 8)}`;
}

function inferPublicSignalCategory(submission: Submission) {
  switch (submission.category) {
    case "bug":
      return "Bug";
    case "feature":
      return "Feature";
    case "survey":
      return "Survey";
    default:
      return "General";
  }
}

export function PublicRoadmapPage() {
  const { formId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormSchema | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [localResponseIds, setLocalResponseIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const manifestBlobId = searchParams.get("manifest") ?? "";

  useEffect(() => {
    async function loadRoadmap() {
      let nextForm = await localStorageAdapter.getForm(formId);
      if (!nextForm && manifestBlobId) {
        const { fetchJsonBlob, readManifest } = await import("../lib/walrus");
        const manifest = await readManifest(manifestBlobId);
        if (manifest?.formBlobId) {
          const restoredForm = await fetchJsonBlob<FormSchema>(manifest.formBlobId);
          if (restoredForm && restoredForm.id === formId) {
            nextForm = {
              ...restoredForm,
              blobId: manifest.formBlobId,
              manifestBlobId,
            };
            await localStorageAdapter.saveForm(nextForm);
            const { upsertFormBlobIndex } = await import("../storage/blobIndex");
            upsertFormBlobIndex({
              formId: nextForm.id,
              formBlobId: manifest.formBlobId,
              manifestBlobId,
              createdAt: manifest.createdAt,
            });
          }
        }
      }
      const rawSubmissions = await localStorageAdapter.listSubmissions(formId);
      setLocalResponseIds(
        new Set(
          listMyResponseHistory()
            .filter((entry) => entry.formId === formId)
            .map((entry) => entry.submissionId),
        ),
      );
      setForm(nextForm ? normalizeForm(nextForm) : null);
      setSubmissions(
        rawSubmissions
          .filter((submission) => PUBLIC_ROADMAP_TRIAGE_STATUSES.includes(submission.triageStatus)),
      );
      setLoading(false);
    }
    void loadRoadmap();
  }, [formId, manifestBlobId]);

  const groupedSubmissions = useMemo(
    () =>
      Object.fromEntries(
        ROADMAP_GROUPS.map((group) => [
          group.key,
          submissions.filter((submission) => submission.triageStatus === group.key),
        ]),
      ) as Record<(typeof ROADMAP_GROUPS)[number]["key"], Submission[]>,
    [submissions],
  );

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(getPublicFormPath(formId, manifestBlobId));
  }

  if (loading) {
    return <div className="panel">Loading public roadmap...</div>;
  }

  if (!form) {
    return (
      <EmptyState>
        <h1>Public roadmap not found</h1>
        <p>This DeepSignal roadmap does not match any saved form.</p>
      </EmptyState>
    );
  }

  return (
    <section className="stack">
      <ContestGuidedFlow
        summary="Signals marked Planned, In Progress, or Fixed appear here on the public roadmap."
        steps={[
          { label: "Select Project", status: "complete" },
          { label: "Create Signal", status: "complete" },
          { label: "Share Public Link", status: "complete" },
          { label: "Submit Private Signal", status: "complete" },
          { label: "Review Inbox", status: "complete" },
          { label: "Decrypt with Wallet", status: "complete" },
          { label: "Publish Roadmap", status: "current" },
        ]}
      />
      <div className="panel glow-panel roadmap-hero">
        <p className="eyebrow">Public Roadmap</p>
        <h1>{form.title}</h1>
        <RichTextContent value={form.description ?? ""} className="lede rich-text-content" fallback="Deep Signals Worth Tracking" />
        <div className="inline-actions">
          <button type="button" className="ghost-button" onClick={handleBack}>
            Back
          </button>
          <Link className="ghost-button" to={getPublicFormPath(form.id, form.manifestBlobId)}>
            Open Public Channel
          </Link>
        </div>
        <div className="roadmap-metadata-grid">
          <PublicSignalMetaRow label="Channel blob" type="blob" value={form.blobId} />
          <PublicSignalMetaRow label="Manifest" type="manifest" value={form.manifestBlobId} />
          <PublicSignalMetaRow
            label="Contributor owner"
            type="contributor"
            value={form.ownerAddress}
            emptyLabel="Legacy demo form"
          />
        </div>
      </div>

      <div className="roadmap-group-grid">
        {ROADMAP_GROUPS.map((group) => (
          <section key={group.key} className="panel roadmap-column">
            <div className="section-row">
              <div>
                <p className="eyebrow">{getTriageStatusLabel(group.key)}</p>
                <h2>{group.label}</h2>
              </div>
              <strong>{groupedSubmissions[group.key].length}</strong>
            </div>

            {groupedSubmissions[group.key].length === 0 ? (
              <p className="roadmap-empty-lane">{getRoadmapEmptyCopy(group.key)}</p>
            ) : (
              <div className="roadmap-card-list">
                {groupedSubmissions[group.key].map((submission) => {
                  const isLocalRespondentSignal = localResponseIds.has(submission.id);
                  return (
                    <article
                      key={submission.id}
                      className={`answer-card roadmap-card ${isLocalRespondentSignal ? "is-local-response" : ""}`}
                    >
                      <div className="section-row roadmap-card-title-row">
                        <div>
                          {isLocalRespondentSignal ? <p className="eyebrow">Your signal</p> : null}
                          <strong>{submission.subjectPreview || `Signal ${submission.id.slice(0, 8)}`}</strong>
                        </div>
                        <div className="roadmap-card-badge-stack">
                          {isLocalRespondentSignal ? <span className="signal-chip roadmap-own-signal-chip">Local receipt matched</span> : null}
                          <span className="signal-chip roadmap-lifecycle-chip">{getRoadmapLifecycleLabel(submission.triageStatus)}</span>
                          <span className={`pill priority-${submission.priority}`}>{submission.priority}</span>
                        </div>
                      </div>
                      <div className="pill-row">
                        <span className="signal-chip">{inferPublicSignalCategory(submission)}</span>
                        <span className="signal-chip">{getTriageStatusLabel(submission.triageStatus)}</span>
                        <span className="signal-chip">{formatDate(submission.createdAt)}</span>
                        <span className="signal-chip">
                          {getSubmissionRespondentMeta(submission).isAnonymous ? "Anonymous respondent" : "Wallet respondent"}
                        </span>
                        {typeof submission.signalValue === "number" ? (
                          <span className="signal-chip">Signal Value {submission.signalValue}/5</span>
                        ) : null}
                      </div>
                      {submission.tags.length > 0 ? (
                        <div className="pill-row">
                          {submission.tags.map((tag) => (
                            <span key={tag} className="tag-pill static-tag-pill">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {!submission.isEncrypted ? (
                        <p className="roadmap-preview">{getPublicSignalPreview(submission)}</p>
                      ) : (
                        <p className="roadmap-metadata-only">
                          Metadata-only roadmap entry. The encrypted signal body stays private while lifecycle status,
                          priority, and respondent metadata remain visible.
                        </p>
                      )}
                      <div className="inline-actions">
                        {isLocalRespondentSignal ? (
                          <Link className="ghost-button" to={`/my-responses/${submission.id}`}>
                            Track lifecycle
                          </Link>
                        ) : null}
                        {submission.githubIssueUrl ? (
                          <a className="ghost-button" href={submission.githubIssueUrl} target="_blank" rel="noreferrer">
                            GitHub Issue
                          </a>
                        ) : null}
                        {submission.githubPrUrl ? (
                          <a className="ghost-button" href={submission.githubPrUrl} target="_blank" rel="noreferrer">
                            GitHub PR
                          </a>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}
