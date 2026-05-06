import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { shortenContributorId } from "../lib/contributors";
import { PUBLIC_ROADMAP_TRIAGE_STATUSES, getTriageStatusLabel } from "../lib/signalOps";
import { getSignalPreview, inferSignalCategory } from "../lib/signalInbox";
import { normalizeForm, normalizeSubmission, storageAdapter } from "../lib/storage";
import { formatDate } from "../lib/utils";
import type { FormSchema, Submission } from "../types";

const ROADMAP_GROUPS = [
  { key: "planned", label: "Planned Signals" },
  { key: "in_progress", label: "In Progress" },
  { key: "fixed", label: "Fixed Signals" },
] as const;

export function PublicRoadmapPage() {
  const { formId = "" } = useParams();
  const [form, setForm] = useState<FormSchema | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRoadmap() {
      const [nextForm, rawSubmissions] = await Promise.all([
        storageAdapter.getForm(formId),
        storageAdapter.listSubmissions(formId),
      ]);
      setForm(nextForm ? normalizeForm(nextForm) : null);
      setSubmissions(
        rawSubmissions
          .map((submission) => normalizeSubmission(submission))
          .filter((submission) => PUBLIC_ROADMAP_TRIAGE_STATUSES.includes(submission.triageStatus)),
      );
      setLoading(false);
    }
    void loadRoadmap();
  }, [formId]);

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
      <div className="panel glow-panel roadmap-hero">
        <p className="eyebrow">Public Roadmap</p>
        <h1>{form.title}</h1>
        <p className="lede">{form.description || "Deep Signals Worth Tracking"}</p>
        <div className="inline-actions">
          <Link className="ghost-button" to={`/f/${form.id}`}>
            Open Public Form
          </Link>
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
              <p className="muted">No signals published in this lane yet.</p>
            ) : (
              <div className="roadmap-card-list">
                {groupedSubmissions[group.key].map((submission) => (
                  <article key={submission.id} className="answer-card roadmap-card">
                    <div className="section-row">
                      <strong>{submission.subjectPreview || `Signal ${submission.id.slice(0, 8)}`}</strong>
                      <span className={`pill priority-${submission.priority}`}>{submission.priority}</span>
                    </div>
                    <div className="pill-row">
                      <span className="signal-chip">{inferSignalCategory(submission)}</span>
                      <span className="signal-chip">{formatDate(submission.createdAt)}</span>
                      <span className="signal-chip">
                        Contributor {shortenContributorId(submission.contributorId)}
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
                      <p className="roadmap-preview">{getSignalPreview(submission)}</p>
                    ) : (
                      <p className="muted">Encrypted signal: public roadmap shows metadata only.</p>
                    )}
                    <div className="inline-actions">
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
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}
