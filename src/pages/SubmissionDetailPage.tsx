import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { EmptyState } from "../components/EmptyState";
import { useAccessControl } from "../hooks/useAccessControl";
import { getReviewAccessState } from "../lib/adminAccess";
import { useI18n } from "../i18n";
import { normalizeSubmission, storageAdapter } from "../lib/storage";
import type { FormSchema } from "../types";

export function SubmissionDetailPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const { capabilityProfile } = useAccessControl(account?.address);
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
    <AdminAccessGate
      hasWallet={Boolean(account?.address)}
      access={getReviewAccessState(resolvedForm, account?.address, capabilityProfile)}
      deniedBody={
        capabilityProfile.isConfigured
          ? "OwnerCap / AdminCap / ReviewerCap を持つウォレットだけが review 画面を開けます。"
          : undefined
      }
    >
      <EmptyState>
        <h1>{t("emptySubmissionNotFound")}</h1>
      </EmptyState>
    </AdminAccessGate>
  );
}
