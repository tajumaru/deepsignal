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
import { useI18n } from "../i18n";
import { getSubmissionRespondentMeta } from "../lib/respondentMeta";
import { PUBLIC_ROADMAP_TRIAGE_STATUSES, getTriageStatusLabel } from "../lib/signalOps";
import { normalizeForm } from "../lib/formSchema";
import { flattenAnswer, formatDate } from "../lib/utils";
import { localStorageAdapter } from "../storage/localStorageAdapter";
import { listMyResponseHistory } from "../storage/myResponseHistory";
import type { FormSchema, Submission } from "../types";

const ROADMAP_GROUPS = [
  { key: "planned", labelKey: "roadmapGroupPlanned" },
  { key: "in_progress", labelKey: "roadmapGroupInProgress" },
  { key: "fixed", labelKey: "roadmapGroupFixed" },
] as const;

function getRoadmapLifecycleLabel(triageStatus: Submission["triageStatus"], t: (key: string) => string) {
  switch (triageStatus) {
    case "planned":
      return t("roadmapLifecyclePlanned");
    case "in_progress":
      return t("roadmapLifecycleInProgress");
    case "fixed":
      return t("roadmapLifecycleFixed");
    default:
      return t("roadmapLifecycleInternal");
  }
}

function getRoadmapEmptyCopy(groupKey: (typeof ROADMAP_GROUPS)[number]["key"], t: (key: string) => string) {
  switch (groupKey) {
    case "planned":
      return t("roadmapEmptyPlanned");
    case "in_progress":
      return t("roadmapEmptyInProgress");
    case "fixed":
      return t("roadmapEmptyFixed");
    default:
      return t("roadmapEmptyDefault");
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

function getRoadmapImpactCopy(triageStatus: Submission["triageStatus"], t: (key: string) => string) {
  switch (triageStatus) {
    case "planned":
      return t("roadmapImpactPlanned");
    case "in_progress":
      return t("roadmapImpactInProgress");
    case "fixed":
      return t("roadmapImpactFixed");
    default:
      return t("roadmapLifecycleInternal");
  }
}

export function PublicRoadmapPage() {
  const { t } = useI18n();
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
  const publicImpactCounts = useMemo(
    () => ({
      planned: groupedSubmissions.planned.length,
      inProgress: groupedSubmissions.in_progress.length,
      completed: groupedSubmissions.fixed.length,
    }),
    [groupedSubmissions],
  );

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(getPublicFormPath(formId, manifestBlobId));
  }

  if (loading) {
    return <div className="panel">{t("roadmapLoading")}</div>;
  }

  if (!form) {
    return (
      <EmptyState>
        <h1>{t("roadmapNotFoundTitle")}</h1>
        <p>{t("roadmapNotFoundBody")}</p>
      </EmptyState>
    );
  }

  return (
    <section className="stack">
      <ContestGuidedFlow
        summary={t("roadmapGuidedSummary")}
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
        <p className="eyebrow">{t("roadmapEyebrow")}</p>
        <h1>{form.title}</h1>
        <RichTextContent value={form.description ?? ""} className="lede rich-text-content" fallback="Deep Signals Worth Tracking" />
        <div className="inline-actions">
          <button type="button" className="ghost-button" onClick={handleBack}>
            {t("roadmapBack")}
          </button>
          <Link className="ghost-button" to={getPublicFormPath(form.id, form.manifestBlobId)}>
            {t("roadmapOpenPublicChannel")}
          </Link>
        </div>
        <div className="roadmap-public-impact" aria-label={t("roadmapPublicImpactTitle")}>
          <span>{t("roadmapPublicImpactTitle")}</span>
          <strong>{t("roadmapPublicImpactPlanned", { count: publicImpactCounts.planned })}</strong>
          <strong>{t("roadmapPublicImpactInProgress", { count: publicImpactCounts.inProgress })}</strong>
          <strong>{t("roadmapPublicImpactCompleted", { count: publicImpactCounts.completed })}</strong>
        </div>
        <div className="roadmap-metadata-grid">
          <PublicSignalMetaRow label={t("roadmapChannelBlob")} type="blob" value={form.blobId} />
          <PublicSignalMetaRow label={t("roadmapManifest")} type="manifest" value={form.manifestBlobId} />
          <PublicSignalMetaRow
            label={t("roadmapContributorOwner")}
            type="contributor"
            value={form.ownerAddress}
            emptyLabel={t("roadmapLegacyDemoForm")}
          />
        </div>
      </div>

      <div className="roadmap-group-grid">
        {ROADMAP_GROUPS.map((group) => (
          <section key={group.key} className="panel roadmap-column">
            <div className="section-row">
              <div>
                <p className="eyebrow">{getTriageStatusLabel(group.key)}</p>
                <h2>{t(group.labelKey)}</h2>
              </div>
              <strong>{groupedSubmissions[group.key].length}</strong>
            </div>

            {groupedSubmissions[group.key].length === 0 ? (
              <p className="roadmap-empty-lane">{getRoadmapEmptyCopy(group.key, t)}</p>
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
                          {isLocalRespondentSignal ? <p className="eyebrow">{t("roadmapOriginatedFromYourSignal")}</p> : null}
                          <strong>{submission.subjectPreview || `Signal ${submission.id.slice(0, 8)}`}</strong>
                          <small className="roadmap-impact-copy">{getRoadmapImpactCopy(submission.triageStatus, t)}</small>
                        </div>
                        <div className="roadmap-card-badge-stack">
                          {isLocalRespondentSignal ? (
                            <span className="signal-chip roadmap-own-signal-chip">{t("roadmapYourSignalHelpedCreate")}</span>
                          ) : null}
                          <span className="signal-chip roadmap-lifecycle-chip">{getRoadmapLifecycleLabel(submission.triageStatus, t)}</span>
                          <span className={`pill priority-${submission.priority}`}>{submission.priority}</span>
                        </div>
                      </div>
                      <div className="pill-row">
                        <span className="signal-chip">{inferPublicSignalCategory(submission)}</span>
                        <span className="signal-chip">{getTriageStatusLabel(submission.triageStatus)}</span>
                        <span className="signal-chip">{formatDate(submission.createdAt)}</span>
                        <span className="signal-chip">
                          {getSubmissionRespondentMeta(submission).isAnonymous ? t("roadmapAnonymousRespondent") : t("roadmapWalletRespondent")}
                        </span>
                        {typeof submission.signalValue === "number" ? (
                          <span className="signal-chip">{t("roadmapSignalValue", { value: submission.signalValue })}</span>
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
                          {t("roadmapEncryptedMetadataOnly")}
                        </p>
                      )}
                      <div className="inline-actions">
                        {isLocalRespondentSignal ? (
                          <Link className="ghost-button" to={`/my-responses/${submission.id}`}>
                            {t("roadmapTrackLifecycle")}
                          </Link>
                        ) : null}
                        {submission.githubIssueUrl ? (
                          <a className="ghost-button" href={submission.githubIssueUrl} target="_blank" rel="noreferrer">
                            {t("roadmapGithubIssue")}
                          </a>
                        ) : null}
                        {submission.githubPrUrl ? (
                          <a className="ghost-button" href={submission.githubPrUrl} target="_blank" rel="noreferrer">
                            {t("roadmapGithubPr")}
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
