import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { useI18n } from "../i18n";
import { normalizeSubmission, storageAdapter } from "../lib/storage";
import type { FormSchema } from "../types";

export function SubmissionDetailPage() {
  const { t } = useI18n();
  const { formId = "", submissionId = "" } = useParams();
  const [resolvedForm, setResolvedForm] = useState<FormSchema | null>(null);
  const [loading, setLoading] = useState(!formId && Boolean(submissionId));

  useEffect(() => {
    if (formId) {
      setResolvedForm({ id: formId } as FormSchema);
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    async function resolveForm() {
      if (formId || !submissionId) {
        return;
      }
      const forms = await storageAdapter.listForms();
      for (const candidate of forms) {
        const submissions = await storageAdapter.listSubmissions(candidate.id);
        const found = submissions.map((submission) => normalizeSubmission(submission)).find((item) => item.id === submissionId);
        if (found) {
          setResolvedForm(candidate);
          break;
        }
      }
      setLoading(false);
    }
    void resolveForm();
  }, [formId, submissionId]);

  if (resolvedForm?.id) {
    return <Navigate to={`/dashboard/forms/${resolvedForm.id}/submissions/${submissionId}`} replace />;
  }

  if (loading) {
    return <div className="panel">{t("loadingSubmissionDetail")}</div>;
  }

  return (
    <EmptyState>
      <h1>{t("emptySubmissionNotFound")}</h1>
    </EmptyState>
  );
}
