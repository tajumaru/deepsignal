import { useCallback, useEffect, useState } from "react";
import { PENDING_SUBMISSION_QUEUE_CHANGED_EVENT, listPendingSubmissions } from "../storage/submissionDelivery";
import type { Submission } from "../types";
import { formatDate } from "../lib/utils";

function isLocalFallbackBlob(blobId?: string | null) {
  return Boolean(blobId && blobId.startsWith("local-"));
}

function needsLocalRecovery(submission: Submission) {
  const primaryBlobId = submission.answerBlobId ?? submission.encryptedBlobId ?? submission.blobId;
  return !primaryBlobId || isLocalFallbackBlob(primaryBlobId) || submission.remoteSyncStatus === "local_only";
}

export function LocalRecoveryCenter({ formId }: { formId?: string }) {
  const [pending, setPending] = useState<Submission[]>([]);
  const [status, setStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [message, setMessage] = useState("");

  const refresh = useCallback(() => {
    const queue = listPendingSubmissions().filter(
      (submission) => (!formId || submission.formId === formId) && needsLocalRecovery(submission),
    );
    setPending(queue);
  }, [formId]);

  useEffect(() => {
    refresh();
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener(PENDING_SUBMISSION_QUEUE_CHANGED_EVENT, onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PENDING_SUBMISSION_QUEUE_CHANGED_EVENT, onStorage);
    };
  }, [refresh]);

  async function retrySync() {
    setStatus("syncing");
    setMessage("");
    try {
      const { retryPendingSubmissionSync } = await import("../storage/storageFactory");
      const result = await retryPendingSubmissionSync();
      refresh();
      setStatus("synced");
      setMessage(`Retried ${result.attempted} pending signal${result.attempted === 1 ? "" : "s"}; synced ${result.synced}.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Pending signal sync failed.");
    }
  }

  if (pending.length === 0 && !message) {
    return null;
  }

  return (
    <section className={`local-recovery-center is-${status}`} aria-live="polite">
      <div>
        <p className="eyebrow">Local recovery center</p>
        <h3>Pending local signals</h3>
        <p className="muted">
          DeepSignal is preserving local signal data until Walrus upload and inbox sync both complete.
        </p>
      </div>
      {pending.length > 0 ? (
        <div className="local-recovery-list">
          {pending.slice(0, 4).map((submission, index) => (
            <article key={submission.id} className="local-recovery-item">
              <strong>
                {submission.respondentMeta?.isAnonymous ? `Anonymous Signal #${index + 1}` : submission.contributorId ?? submission.id}
              </strong>
              <span>{formatDate(submission.createdAt)}</span>
              <small>{submission.remoteSyncStatus ?? "local_only"}</small>
            </article>
          ))}
        </div>
      ) : null}
      {message ? <p className={status === "error" ? "error-text" : "muted"}>{message}</p> : null}
      <div className="inline-actions">
        <button type="button" className="ghost-button" onClick={refresh}>
          Refresh local recovery
        </button>
        <button type="button" className="primary-button" onClick={() => void retrySync()} disabled={status === "syncing"}>
          {status === "syncing" ? "Retrying..." : "Retry pending sync"}
        </button>
      </div>
    </section>
  );
}
