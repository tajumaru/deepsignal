import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../../i18n";
import type { Submission } from "../../../types";

type TranslationFn = ReturnType<typeof useI18n>["t"];

interface ReviewResultItem {
  label: string;
  value: string;
  href?: string;
}

interface ReviewResultCardProps {
  t: TranslationFn;
  submission: Submission;
  hasSavedReviewResult: boolean;
  signalValueSummary: string;
  signalValueStars: boolean[] | null;
  publicDecisionLabel: string;
  isOnRoadmap: boolean;
  reviewResultItems: ReviewResultItem[];
  reviewSummaryBadges: string[];
  needsFollowUp: boolean;
  roadmapUrl: string;
  reviewAction?: ReactNode;
}

export function ReviewResultCard({
  t,
  submission,
  hasSavedReviewResult,
  signalValueSummary,
  signalValueStars,
  publicDecisionLabel,
  isOnRoadmap,
  reviewResultItems,
  reviewSummaryBadges,
  needsFollowUp,
  roadmapUrl,
  reviewAction,
}: ReviewResultCardProps) {
  return (
    <section className="answer-card review-result-card">
      <div className="review-controls-header">
        <div>
          <p className="eyebrow">{t("reviewResultEyebrow")}</p>
          <h3>{hasSavedReviewResult ? t("savedReviewResultTitle") : t("noReviewSavedYetTitle")}</h3>
          <p className="review-helper-copy">
            {hasSavedReviewResult ? t("savedReviewResultBody") : t("noReviewSavedYetBody")}
          </p>
        </div>
      </div>

      <div className="review-result-grid">
        <div className="review-result-item review-result-item-featured">
          <span>{t("signalValueLabel")}</span>
          {signalValueStars ? (
            <>
              <strong>{signalValueSummary}</strong>
              <div className="review-result-stars" aria-label={t("signalValueRatingLabel")}>
                {signalValueStars.map((isFilled, index) => (
                  <span
                    key={index}
                    className={isFilled ? "review-result-star is-filled" : "review-result-star is-empty"}
                    aria-hidden="true"
                  >
                    {"\u2605"}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <strong>{t("notScored")}</strong>
          )}
        </div>
        <div className="review-result-item review-result-item-wide">
          <span>{t("reviewBadgesLabel")}</span>
          <div className="review-result-inline-badges">
            <span className={`pill status-${submission.status}`}>
              {submission.status === "read" ? t("statusRead") : submission.status === "archived" ? t("statusArchived") : t("statusUnread")}
            </span>
            <span className={`pill priority-${submission.priority}`}>
              {submission.priority === "high" ? t("priorityHigh") : submission.priority === "low" ? t("priorityLow") : t("priorityMedium")}
            </span>
            <span className="pill">
              {submission.triageStatus === "investigating"
                ? t("triageStatusInvestigating")
                : submission.triageStatus === "planned"
                  ? t("triageStatusPlanned")
                  : submission.triageStatus === "in_progress"
                    ? t("triageStatusInProgress")
                    : submission.triageStatus === "fixed"
                      ? t("triageStatusFixed")
                      : submission.triageStatus === "closed"
                        ? t("triageStatusClosed")
                        : t("triageStatusNew")}
            </span>
            <span className="signal-chip signal-chip-soft">{publicDecisionLabel}</span>
            <span className={`signal-chip ${isOnRoadmap ? "signal-chip-accent" : ""}`}>
              {isOnRoadmap ? t("roadmapLinkedLabel") : t("publicDecisionInternalOnly")}
            </span>
          </div>
        </div>
        <div className={`review-result-item review-result-item-wide roadmap-visibility-item ${isOnRoadmap ? "is-visible" : "is-private"}`}>
          <span>{t("roadmapVisibilityLabel")}</span>
          <strong>{isOnRoadmap ? t("visibleOnPublicRoadmap") : t("privateNotOnRoadmap")}</strong>
          {submission.isEncrypted ? <small>{t("encryptedRoadmapMetadataOnly")}</small> : null}
        </div>
        {reviewResultItems.map((item) => (
          <div key={item.label} className="review-result-item">
            <span>{item.label}</span>
            {item.href ? <Link to={item.href}>{item.value}</Link> : <strong>{item.value}</strong>}
          </div>
        ))}
      </div>

      <div className="review-result-footer">
        <div className="review-result-badges">
          {reviewSummaryBadges.map((badge) => (
            <span key={badge} className="signal-chip signal-chip-soft">{badge}</span>
          ))}
          {needsFollowUp ? <span className="signal-chip signal-chip-accent">{t("needsFollowUpLabel")}</span> : null}
        </div>
        <div className="review-action-bar">
          {reviewAction}
          {submission.githubIssueUrl ? (
            <a
              className="ghost-button"
              href={submission.githubIssueUrl}
              target="_blank"
              rel="noreferrer"
            >
              {t("openGithubIssue")}
            </a>
          ) : null}
          {isOnRoadmap ? (
            <Link className="ghost-button" to={roadmapUrl}>
              {t("openRoadmap")}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
