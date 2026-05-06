import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BlobLink } from "../components/BlobLink";
import { EmptyState } from "../components/EmptyState";
import { useI18n } from "../i18n";
import { shortAddress } from "../lib/sui";
import { storageAdapter } from "../lib/storage";
import { formatDate } from "../lib/utils";
import type { FormSchema, Submission } from "../types";

interface FormWithCount extends FormSchema {
  submissionCount: number;
}

export function AdminDashboardPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const [forms, setForms] = useState<FormWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);

  useEffect(() => {
    void loadForms();
  }, []);

  async function loadForms() {
    const allForms = await storageAdapter.listForms();
    const counts = await Promise.all(
      allForms.map(async (form) => {
        const submissions: Submission[] = await storageAdapter.listSubmissions(form.id);
        return { ...form, submissionCount: submissions.length };
      }),
    );
    setForms(counts);
    setLoading(false);
  }

  async function handleDelete(formId: string) {
    if (!window.confirm(t("deleteFormConfirm"))) {
      return;
    }
    setDeletingFormId(formId);
    await storageAdapter.deleteForm(formId);
    await loadForms();
    setDeletingFormId(null);
  }

  if (loading) {
    return <div className="panel">{t("loadingResearchLab")}</div>;
  }

  return (
    <section className="stack">
      <div className="section-row panel glow-panel">
        <div>
          <p className="eyebrow">{t("adminEyebrow")}</p>
          <h1>{t("adminTitle")}</h1>
          {account?.address ? (
            <p className="wallet-inline-note">
              {t("connectedLabel")}: {shortAddress(account.address)}
            </p>
          ) : (
            <p className="wallet-inline-note">{t("dashboardWalletHint")}</p>
          )}
        </div>
        <Link className="primary-button" to="/admin/forms/new">
          {t("adminNewForm")}
        </Link>
      </div>

      {forms.length === 0 ? (
        <EmptyState>
          <h2>{t("adminNoForms")}</h2>
          <p>{t("adminNoFormsBody")}</p>
          <Link className="primary-button" to="/admin/forms/new">
            {t("landingCreate")}
          </Link>
        </EmptyState>
      ) : (
        <div className="card-grid">
          {forms.map((form) => (
            <article key={form.id} className="panel glow-panel">
              <p className="eyebrow">
                {t("adminBlob", { blobId: form.blobId ?? t("pending") })}
              </p>
              <BlobLink blobId={form.blobId} />
              <h2>{form.title}</h2>
              <p>{form.description || t("noDescription")}</p>
              {form.ownerAddress ? (
                <p className="muted">
                  {t("formOwnerLabel")}: {shortAddress(form.ownerAddress)}
                </p>
              ) : null}
              {form.isOnchain ? (
                <p className="muted">{t("formOnchainReady")}</p>
              ) : null}
              <dl className="stat-row">
                <div>
                  <dt>{t("statFields")}</dt>
                  <dd>{form.fields.length}</dd>
                </div>
                <div>
                  <dt>{t("statSubmissions")}</dt>
                  <dd>{form.submissionCount}</dd>
                </div>
                <div>
                  <dt>{t("statCreated")}</dt>
                  <dd>{formatDate(form.createdAt)}</dd>
                </div>
              </dl>
              <div className="cta-row">
                <Link className="primary-button" to={`/dashboard/forms/${form.id}`}>
                  {t("reviewSubmissions")}
                </Link>
                <Link className="ghost-button" to={`/f/${form.id}`}>
                  {t("openPublicForm")}
                </Link>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => void handleDelete(form.id)}
                  disabled={deletingFormId === form.id}
                >
                  {deletingFormId === form.id ? t("deleting") : t("deleteForm")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
