import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import "../styles/components/metadata-proof.css";
import "../styles/pages/admin-inbox.css";
import "../styles/mobile/layout.css";
import "../styles/mobile/workspace.css";
import "../styles/mobile/signal.css";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { EmptyState } from "../components/EmptyState";
import { useAccessControl } from "../hooks/useAccessControl";
import { useSuiWallet } from "../hooks/useSuiWallet";
import { getReviewAccessState } from "../lib/adminAccess";
import { useI18n } from "../i18n";
import { normalizeSubmission } from "../lib/submissionSchema";
import { storageAdapter } from "../lib/storageAdapter";
import type { FormSchema } from "../types";

export function SubmissionDetailPage() {
  const { t } = useI18n();
  const wallet = useSuiWallet();
  const { capabilityProfile, isLoadingAccess } = useAccessControl(wallet.accountAddress);
  const { formId = "", submissionId = "" } = useParams();
  const reviewDeniedBody = capabilityProfile.isConfigured ? t("reviewAccessRequiresCapability") : undefined;
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
    const params = new URLSearchParams({ tab: "review", form: resolvedForm.id });
    if (submissionId) {
      params.set("signal", submissionId);
    }
    return <Navigate to={`/dashboard?${params.toString()}`} replace />;
  }

  if (loading) {
    return <div className="panel">{t("loadingSubmissionDetail")}</div>;
  }

  if (isLoadingAccess) {
    return <div className="panel">Checking wallet capabilities...</div>;
  }

  return (
    <AdminAccessGate
      hasWallet={Boolean(wallet.accountAddress)}
      access={getReviewAccessState(resolvedForm, wallet.accountAddress, capabilityProfile)}
      deniedBody={reviewDeniedBody ?? (
        capabilityProfile.isConfigured
          ? t("reviewAccessRequiresCapability")
          : undefined
      )}
    >
      <EmptyState>
        <h1>{t("emptySubmissionNotFound")}</h1>
      </EmptyState>
    </AdminAccessGate>
  );
}
