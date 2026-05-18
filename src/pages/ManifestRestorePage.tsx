import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { localStorageAdapter } from "../storage/localStorageAdapter";
import { replaceSubmissionBlobIndex, upsertFormBlobIndex } from "../storage/blobIndex";
import { fetchJsonBlob, readManifest } from "../lib/walrus";
import type { FormSchema, Submission } from "../types";

export function ManifestRestorePage() {
  const { manifestBlobId = "" } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    async function restore() {
      const manifest = await readManifest(manifestBlobId);
      if (!manifest) {
        setError("Manifest blob could not be loaded.");
        setStatus("error");
        return;
      }

      const form = await fetchJsonBlob<FormSchema>(manifest.formBlobId);
      if (!form) {
        setError("Form blob could not be loaded from the manifest.");
        setStatus("error");
        return;
      }

      const restoredSubmissions = await Promise.all(
        manifest.submissions.map(async (entry) => {
          const submission = await fetchJsonBlob<Submission>(entry.blobId);
          if (!submission) {
            return null;
          }
          return { ...submission, blobId: entry.blobId };
        }),
      );
      const submissions: Submission[] = restoredSubmissions.filter(
        (submission): submission is Submission & { blobId: string } => submission !== null,
      );

      await localStorageAdapter.deleteForm(form.id);
      await localStorageAdapter.saveForm({
        ...form,
        blobId: manifest.formBlobId,
        manifestBlobId,
      });
      await Promise.all(
        submissions.map((submission) => localStorageAdapter.saveSubmission(submission)),
      );

      upsertFormBlobIndex({
        formId: form.id,
        formBlobId: manifest.formBlobId,
        manifestBlobId,
        createdAt: manifest.createdAt,
      });
      replaceSubmissionBlobIndex(
        form.id,
        manifest.submissions.map((entry) => ({
          submissionId: entry.submissionId,
          formId: form.id,
          blobId: entry.blobId,
          createdAt: entry.createdAt,
        })),
      );

      navigate(`/dashboard/forms/${form.id}`, { replace: true });
    }

    void restore();
  }, [manifestBlobId, navigate]);

  if (status === "loading") {
    return (
      <section className="panel glow-panel">
        <p className="eyebrow">Manifest Restore</p>
        <h1>Rebuilding local cache...</h1>
        <p>Manifest links are recovery links, not access control.</p>
      </section>
    );
  }

  return (
    <EmptyState>
      <h1>Manifest restore failed</h1>
      <p>{error}</p>
      <p>Manifest links are recovery links, not access control.</p>
    </EmptyState>
  );
}
