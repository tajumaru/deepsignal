import {
  createSubmissionClusterId,
  findSimilarSignals,
  getClusterInsights,
  getSubmissionKeywords,
  getSubmissionSummary,
} from "../lib/signalTriage";
import { formatDate } from "../lib/utils";
import type { FormSchema, Submission } from "../types";

interface SignalClusterPanelProps {
  selectedSubmission: Submission;
  submissions: Submission[];
  formById?: Record<string, FormSchema | undefined>;
  formTitleById?: Record<string, string | undefined>;
  busy?: boolean;
  onSelectSignal?: (submissionId: string) => void;
  onSaveSubmission: (submission: Submission) => Promise<void>;
}

function formatSimilarity(similarity: number) {
  return `${Math.round(similarity * 100)}% match`;
}

export function SignalClusterPanel({
  selectedSubmission,
  submissions,
  formById,
  formTitleById,
  busy = false,
  onSelectSignal,
  onSaveSubmission,
}: SignalClusterPanelProps) {
  const similarSignals = findSimilarSignals(selectedSubmission, submissions, formById);
  const clusterInsights = getClusterInsights(selectedSubmission, submissions, formById);
  const currentCluster = selectedSubmission.clusterId
    ? clusterInsights.find((cluster) => cluster.id === selectedSubmission.clusterId) ?? null
    : null;
  const joinableClusters = clusterInsights.filter((cluster) => cluster.id !== selectedSubmission.clusterId);
  const aiSummary = getSubmissionSummary(selectedSubmission, formById?.[selectedSubmission.formId]);
  const keywords = getSubmissionKeywords(selectedSubmission, formById?.[selectedSubmission.formId]);

  async function joinCluster(clusterId: string) {
    await onSaveSubmission({
      ...selectedSubmission,
      clusterId,
      updatedAt: new Date().toISOString(),
    });
  }

  async function createCluster() {
    await onSaveSubmission({
      ...selectedSubmission,
      clusterId: createSubmissionClusterId(selectedSubmission),
      updatedAt: new Date().toISOString(),
    });
  }

  async function clearCluster() {
    await onSaveSubmission({
      ...selectedSubmission,
      clusterId: undefined,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <>
      <section className="answer-card">
        <div className="section-row">
          <h3>AI Triage</h3>
          <span className="muted">
            {selectedSubmission.clusterId ? "Cluster attached" : "Not clustered yet"}
          </span>
        </div>
        <p>{aiSummary}</p>
        <div className="signal-badge-row">
          <span className="signal-chip">Severity {selectedSubmission.severity ?? "medium"}</span>
          <span className="signal-chip">Emotion {selectedSubmission.emotion ?? "neutral"}</span>
          <span className="signal-chip">Category {selectedSubmission.category ?? "general"}</span>
          {selectedSubmission.clusterId ? (
            <span className="signal-chip signal-chip-accent">
              Cluster {selectedSubmission.clusterId.slice(0, 16)}
            </span>
          ) : null}
        </div>
        <div className="signal-badge-row">
          {keywords.length === 0 ? (
            <span className="muted">No extracted keywords yet.</span>
          ) : (
            keywords.map((keyword) => (
              <span key={keyword} className="signal-chip">
                {keyword}
              </span>
            ))
          )}
        </div>
      </section>

      <section className="answer-card">
        <div className="section-row">
          <h3>Similar Signals</h3>
          <span className="muted">{similarSignals.length}</span>
        </div>
        {similarSignals.length === 0 ? (
          <p className="muted">No close matches found yet. You can create a fresh cluster for this signal.</p>
        ) : (
          <div className="cluster-list">
            {similarSignals.map(({ submission, similarity }) => (
              <div key={submission.id} className="cluster-card">
                <div className="cluster-card-main">
                  <strong>{submission.subjectPreview ?? submission.id}</strong>
                  <p className="muted">
                    {formTitleById?.[submission.formId] ?? submission.formId} · {formatDate(submission.createdAt)}
                  </p>
                  <p>{getSubmissionSummary(submission, formById?.[submission.formId])}</p>
                  <div className="signal-badge-row">
                    <span className="signal-chip">{formatSimilarity(similarity)}</span>
                    {submission.clusterId ? (
                      <span className="signal-chip signal-chip-accent">
                        In {submission.clusterId.slice(0, 16)}
                      </span>
                    ) : null}
                    {getSubmissionKeywords(submission, formById?.[submission.formId])
                      .slice(0, 3)
                      .map((keyword) => (
                        <span key={`${submission.id}-${keyword}`} className="signal-chip">
                          {keyword}
                        </span>
                      ))}
                  </div>
                </div>
                <div className="cluster-card-actions">
                  {onSelectSignal ? (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => onSelectSignal(submission.id)}
                    >
                      Open signal
                    </button>
                  ) : null}
                  {submission.clusterId && submission.clusterId !== selectedSubmission.clusterId ? (
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy}
                      onClick={() => void joinCluster(submission.clusterId!)}
                    >
                      Join this cluster
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="answer-card">
        <div className="section-row">
          <h3>Cluster Actions</h3>
          <span className="muted">{currentCluster ? `${currentCluster.signalCount} signals` : "No active cluster"}</span>
        </div>
        {currentCluster ? (
          <div className="cluster-card">
            <div className="cluster-card-main">
              <strong>{currentCluster.label}</strong>
              <p>{currentCluster.summary}</p>
              <div className="signal-badge-row">
                <span className="signal-chip">Severity {currentCluster.severity}</span>
                <span className="signal-chip">{currentCluster.signalCount} grouped signals</span>
                {currentCluster.keywords.map((keyword) => (
                  <span key={keyword} className="signal-chip">
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
            <div className="cluster-card-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={busy}
                onClick={() => void clearCluster()}
              >
                Remove from cluster
              </button>
            </div>
          </div>
        ) : (
          <p className="muted">This signal is still unassigned, so it will not appear in a reusable cluster yet.</p>
        )}

        {joinableClusters.length > 0 ? (
          <div className="cluster-list">
            {joinableClusters.map((cluster) => (
              <div key={cluster.id} className="cluster-card">
                <div className="cluster-card-main">
                  <strong>{cluster.label}</strong>
                  <p>{cluster.summary}</p>
                  <div className="signal-badge-row">
                    <span className="signal-chip">{formatSimilarity(cluster.similarity)}</span>
                    <span className="signal-chip">Severity {cluster.severity}</span>
                    <span className="signal-chip">{cluster.signalCount} signals</span>
                    {cluster.keywords.map((keyword) => (
                      <span key={`${cluster.id}-${keyword}`} className="signal-chip">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="cluster-card-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busy}
                    onClick={() => void joinCluster(cluster.id)}
                  >
                    Join cluster
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="inline-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void createCluster()}
          >
            {selectedSubmission.clusterId ? "Create new cluster for this signal" : "Create cluster"}
          </button>
        </div>
      </section>
    </>
  );
}
