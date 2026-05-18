import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CreateFormLink } from "../components/CreateFormLink";
import { useSuiWallet } from "../hooks/useSuiWallet";
import { useI18n } from "../i18n";
import { buildExploreAiPreview, getExploreCategory, isFormPubliclyExplorable, type ExploreCategory } from "../lib/explore";
import { getPublicFormPath } from "../lib/publicLinks";
import { isResponseDeadlinePassed } from "../lib/responseDeadline";
import { normalizeForm, normalizeSubmission, storageAdapter } from "../lib/storage";
import { formatDate } from "../lib/utils";
import type { FormSchema, Submission } from "../types";

type ExploreCard = {
  form: FormSchema;
  category: ExploreCategory;
  signalCount: number;
  updatedAt: string;
  roadmapCount: number;
};

type DiscoverTab = "trending" | "new" | "active" | "ai" | "governance" | "anonymous" | "encrypted";

const EXPLORE_DELETED_FORMS_KEY = "deepsignal.exploreDeletedForms";
const EXPLORE_SUBMISSION_LOAD_CONCURRENCY = 4;

const DISCOVER_TABS: DiscoverTab[] = ["trending", "new", "active", "ai", "governance", "anonymous", "encrypted"];

function getCreatorLabel(form: FormSchema, localCreatorLabel: string) {
  if (form.projectName?.trim()) {
    return form.projectName.trim();
  }
  if (form.ownerAddress) {
    return `${form.ownerAddress.slice(0, 6)}…${form.ownerAddress.slice(-4)}`;
  }
  return localCreatorLabel;
}

function matchesKeyword(form: FormSchema, keywords: string[]) {
  const haystack = [form.title, form.description, form.projectName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

function getDeadlineTone(form: Pick<FormSchema, "responseDeadline">) {
  if (typeof form.responseDeadline !== "number" || !Number.isFinite(form.responseDeadline)) {
    return "none";
  }
  if (isResponseDeadlinePassed(form.responseDeadline)) {
    return "closed";
  }
  const msLeft = form.responseDeadline - Date.now();
  if (msLeft <= 1000 * 60 * 60 * 24) {
    return "urgent";
  }
  if (msLeft <= 1000 * 60 * 60 * 24 * 3) {
    return "soon";
  }
  return "scheduled";
}

function readExploreDeletedFormIds() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }
  try {
    const raw = window.localStorage.getItem(EXPLORE_DELETED_FORMS_KEY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(ids.filter((id) => typeof id === "string" && id.trim()));
  } catch {
    return new Set<string>();
  }
}

function saveExploreDeletedFormIds(ids: Set<string>) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(EXPLORE_DELETED_FORMS_KEY, JSON.stringify([...ids]));
}

function rememberExploreDeletedForm(formId: string) {
  const ids = readExploreDeletedFormIds();
  ids.add(formId);
  saveExploreDeletedFormIds(ids);
}

function buildExploreCard(form: FormSchema, submissions: Submission[] = []): ExploreCard {
  const updatedAt = submissions[0]?.updatedAt ?? form.updatedAt ?? form.createdAt;
  const exploreCategory = getExploreCategory(form);
  const roadmapCount = submissions.filter((submission) =>
    submission.triageStatus === "planned" ||
    submission.triageStatus === "in_progress" ||
    submission.triageStatus === "fixed",
  ).length;

  return {
    form,
    category: exploreCategory,
    signalCount: submissions.length,
    updatedAt,
    roadmapCount,
  };
}

export function ExploreSignalsPage() {
  const { t } = useI18n();
  const wallet = useSuiWallet();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<ExploreCard[]>([]);
  const [activeTab, setActiveTab] = useState<DiscoverTab>("trending");
  const [deletingFormId, setDeletingFormId] = useState("");
  const loadSequenceRef = useRef(0);

  const loadExplore = useCallback(async () => {
    const loadSequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = loadSequence;
    setLoading(true);
    const allStorageForms = await storageAdapter.listForms();
    if (loadSequenceRef.current !== loadSequence) {
      return;
    }

    const deletedFormIds = readExploreDeletedFormIds();
    const allForms: FormSchema[] = allStorageForms
      .filter((form) => !deletedFormIds.has(form.id))
      .map((form) => normalizeForm(form));
    const forms = allForms.filter((form) => isFormPubliclyExplorable(form));
    setCards(forms.map((form) => buildExploreCard(form)));
    setLoading(false);

    let nextFormIndex = 0;
    const workerCount = Math.min(EXPLORE_SUBMISSION_LOAD_CONCURRENCY, forms.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextFormIndex < forms.length) {
          const form = forms[nextFormIndex];
          nextFormIndex += 1;
          const submissions = (await storageAdapter.listSubmissions(form.id)).map((submission) => normalizeSubmission(submission));
          if (loadSequenceRef.current !== loadSequence) {
            return;
          }
          setCards((currentCards) =>
            currentCards.map((card) =>
              card.form.id === form.id ? buildExploreCard(form, submissions) : card,
            ),
          );
        }
      }),
    );
  }, []);

  useEffect(() => {
    void loadExplore();
  }, [loadExplore]);

  function canDeleteForm(form: Pick<FormSchema, "creationMode" | "ownerAddress">) {
    return (
      form.creationMode === "guest" &&
      Boolean(
        wallet.accountAddress &&
          form.ownerAddress &&
          form.ownerAddress.toLowerCase() === wallet.accountAddress.toLowerCase(),
      )
    );
  }

  async function handleDeleteForm(formId: string, title: string) {
    if (!window.confirm(t("exploreDeleteConfirm", { title: title || t("untitledForm") }))) {
      return;
    }
    setDeletingFormId(formId);
    try {
      rememberExploreDeletedForm(formId);
      await storageAdapter.deleteForm(formId);
      await loadExplore();
    } catch (error) {
      console.warn("Delete fell back to hiding the form from this browser.", error);
      await loadExplore();
    } finally {
      setDeletingFormId("");
    }
  }

  const filteredCards = useMemo(() => {
    const next = cards.filter((card) => {
      if (activeTab === "ai") {
        return matchesKeyword(card.form, ["ai", "agent", "model", "llm", "automation"]);
      }
      if (activeTab === "governance") {
        return matchesKeyword(card.form, ["governance", "dao", "proposal", "vote", "voting", "treasury", "community"]);
      }
      if (activeTab === "anonymous") {
        return card.form.identityPolicy === "anonymous_allowed";
      }
      if (activeTab === "encrypted") {
        return card.form.encryptSubmissions === true;
      }
      if (activeTab === "active") {
        return card.signalCount > 0;
      }
      return true;
    });

    const sorted = [...next];
    sorted.sort((left, right) => {
      const leftUpdated = new Date(left.updatedAt).getTime();
      const rightUpdated = new Date(right.updatedAt).getTime();

      if (activeTab === "new") {
        return rightUpdated - leftUpdated;
      }

      const leftScore = left.signalCount * 3 + left.roadmapCount * 2 + (Date.now() - leftUpdated < 1000 * 60 * 60 * 24 ? 8 : 0);
      const rightScore = right.signalCount * 3 + right.roadmapCount * 2 + (Date.now() - rightUpdated < 1000 * 60 * 60 * 24 ? 8 : 0);
      return rightScore - leftScore || rightUpdated - leftUpdated;
    });

    return sorted;
  }, [activeTab, cards]);

  const heroCountLabel = loading
    ? t("exploreScanningWorkspace")
    : t("exploreSignalsInView", { count: filteredCards.length });

  function getDiscoverTabLabel(tab: DiscoverTab) {
    switch (tab) {
      case "trending":
        return t("exploreTabTrending");
      case "new":
        return t("exploreTabNew");
      case "active":
        return t("exploreTabActive");
      case "ai":
        return t("exploreTabAi");
      case "governance":
        return t("exploreTabGovernance");
      case "anonymous":
        return t("exploreTabAnonymous");
      case "encrypted":
        return t("exploreTabEncrypted");
    }
  }

  function getLocalizedPurposeLabel(form: FormSchema) {
    switch (form.purpose) {
      case "bug":
        return t("explorePurposeBug");
      case "feature":
        return t("explorePurposeFeature");
      case "survey":
        return t("explorePurposeSurvey");
      default:
        return t("explorePurposeApplication");
    }
  }

  function getLocalizedCategoryLabel(category: ExploreCategory) {
    switch (category) {
      case "Bug":
        return t("exploreCategoryBug");
      case "Feature":
        return t("exploreCategoryFeature");
      case "Survey":
        return t("exploreCategorySurvey");
      case "Application":
        return t("exploreCategoryApplication");
      default:
        return t("exploreCategoryAll");
    }
  }

  function getLocalizedDeadlineLabel(form: Pick<FormSchema, "responseDeadline">) {
    if (typeof form.responseDeadline !== "number" || !Number.isFinite(form.responseDeadline)) {
      return t("exploreNoDeadline");
    }
    if (isResponseDeadlinePassed(form.responseDeadline)) {
      return t("exploreClosed");
    }
    return formatDate(new Date(form.responseDeadline).toISOString());
  }

  function getLocalizedAiPreview(card: ExploreCard) {
    return buildExploreAiPreview({
      category: card.category,
      signalCount: card.signalCount,
      updatedAt: card.updatedAt,
      labels: {
        category: getLocalizedCategoryLabel(card.category),
        freshActivity: t("explorePreviewFreshActivity"),
        activeFlow: t("explorePreviewActiveFlow"),
        quietStream: t("explorePreviewQuietStream"),
        highVolume: t("explorePreviewHighVolume"),
        steadyTraffic: t("explorePreviewSteadyTraffic"),
        earlyCluster: t("explorePreviewEarlyCluster"),
        awaitingFirstSignal: t("explorePreviewAwaitingFirstSignal"),
        prefix: t("explorePreviewPrefix"),
        channelSuffix: t("explorePreviewChannelSuffix"),
      },
    });
  }

  return (
    <section className="explore-shell">
      <section className="panel glow-panel explore-hero explore-hero-compact">
        <div className="explore-grid-overlay" aria-hidden="true" />
        <div className="explore-scanlines" aria-hidden="true" />
        <div className="explore-dataflow" aria-hidden="true" />
        <div className="explore-radar-sweep" aria-hidden="true" />
        <div className="explore-grid-glow" aria-hidden="true" />
        <div className="explore-node-field" aria-hidden="true">
          <span className="explore-node node-a" />
          <span className="explore-node node-b" />
          <span className="explore-node node-c" />
          <span className="explore-node node-d" />
          <span className="explore-pulse pulse-a" />
          <span className="explore-pulse pulse-b" />
          <span className="explore-pulse pulse-c" />
        </div>

        <div className="explore-hero-bar">
          <div className="explore-hero-copy">
            <p className="eyebrow">{t("exploreEyebrow")}</p>
            <h1>{t("exploreTitle")}</h1>
            <p className="lede">{t("exploreLede")}</p>
            <p className="muted explore-hero-note">
              {t("exploreHeroNote")}
            </p>
          </div>
          <div className="explore-hero-summary">
            <span className="signal-chip signal-chip-accent">{heroCountLabel}</span>
            <span className="signal-chip">{t("exploreListedHere", { count: cards.length })}</span>
          </div>
        </div>
      </section>

      <section className="panel glow-panel explore-discovery-panel">
        <div className="explore-discovery-bar">
          <div className="explore-tab-row" role="tablist" aria-label={t("exploreTabsAria")}>
            {DISCOVER_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`explore-tab ${activeTab === tab ? "is-active" : ""}`}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
              >
                {getDiscoverTabLabel(tab)}
              </button>
            ))}
          </div>
          <div className="explore-feed-meta">
            <span>{loading ? t("exploreRefreshingFeed") : t("exploreVisibleCount", { count: filteredCards.length })}</span>
          </div>
        </div>

        {filteredCards.length === 0 ? (
          <section className="explore-empty-minimal">
            <h2>{t("exploreEmptyTitle")}</h2>
            <div className="explore-empty-copy">
              <p className="muted">
                {t("exploreEmptyPrivateCopy")}
              </p>
              <p className="muted">
                {t("exploreEmptyRuntimeCopy")}
              </p>
            </div>
            <div className="inline-actions">
              <CreateFormLink className="primary-button">
                {t("exploreCreateSignal")}
              </CreateFormLink>
            </div>
          </section>
        ) : (
          <section className="explore-card-grid">
            {filteredCards.map((card) => {
              const publicPath = getPublicFormPath(card.form.id, card.form.manifestBlobId);
              const creatorLabel = getCreatorLabel(card.form, t("exploreLocalCreator"));
              const isOwnForm = canDeleteForm(card.form);

              return (
                <Fragment key={card.form.id}>
                  <Link className="mobile-explore-row" to={publicPath}>
                    <span className="mobile-signal-avatar" aria-hidden="true">
                      {getLocalizedPurposeLabel(card.form).slice(0, 2).toUpperCase()}
                      <span className={`mobile-signal-status-dot status-${card.signalCount > 0 ? "unread" : "archived"}`} />
                    </span>
                    <span className="mobile-signal-main">
                      <span className="mobile-signal-title-line">
                        <strong>{card.form.title}</strong>
                      </span>
                      <span className="mobile-signal-preview">
                        {card.form.description || t("exploreDefaultDescription")}
                      </span>
                      <span className="mobile-signal-source-line">
                        <span>{creatorLabel}</span>
                        <span>{getLocalizedPurposeLabel(card.form)}</span>
                      </span>
                      <span className="mobile-signal-meta-row">
                        <span className="mobile-signal-mini-badge">
                          {card.form.visibility === "public" ? t("exploreListed") : t("exploreUnlisted")}
                        </span>
                        {card.form.encryptSubmissions ? <span className="mobile-signal-mini-badge">{t("exploreEncrypted")}</span> : null}
                        <span className="mobile-signal-mini-badge">{getLocalizedDeadlineLabel(card.form)}</span>
                      </span>
                    </span>
                    <span className="mobile-signal-side">
                      <time>{formatDate(card.updatedAt)}</time>
                      <span className="mobile-priority-badge">{t("exploreResponsesShort", { count: card.signalCount })}</span>
                    </span>
                  </Link>

                  <article className="panel glow-panel explore-card explore-feed-card">
                  <div className="explore-card-ambient" aria-hidden="true" />

                  <div className="explore-feed-card-top">
                    <div>
                      <div className="pill-row">
                        <span className="signal-chip signal-chip-accent">{t("explorePublic")}</span>
                        <span className="signal-chip">{card.form.visibility === "public" ? t("exploreListed") : t("exploreUnlisted")}</span>
                        {card.form.encryptSubmissions ? <span className="signal-chip">{t("exploreEncrypted")}</span> : null}
                      </div>
                      <h2>{card.form.title}</h2>
                    </div>
                    <div className="explore-feed-card-side">
                      <div className={`explore-deadline-pill is-${getDeadlineTone(card.form)}`}>
                        <span>{t("exploreDeadline")}</span>
                        <strong>{getLocalizedDeadlineLabel(card.form)}</strong>
                      </div>
                      <div className="explore-card-count">
                        <strong>{card.signalCount}</strong>
                        <span>{t("exploreResponses")}</span>
                      </div>
                    </div>
                  </div>

                  <p className="explore-feed-description muted">
                    {card.form.description || t("exploreDefaultDescription")}
                  </p>

                  <div className="explore-feed-stats">
                    <div className="explore-feed-stat">
                      <span>{t("exploreCreator")}</span>
                      <strong>{creatorLabel}</strong>
                    </div>
                    <div className="explore-feed-stat">
                      <span>{t("exploreLatest")}</span>
                      <strong>{formatDate(card.updatedAt)}</strong>
                    </div>
                    <div className="explore-feed-stat">
                      <span>{t("exploreCategory")}</span>
                      <strong>{getLocalizedPurposeLabel(card.form)}</strong>
                    </div>
                    <div className="explore-feed-stat">
                      <span>{t("exploreActivity")}</span>
                      <strong>{t("exploreRoadmapCount", { count: card.roadmapCount })}</strong>
                    </div>
                  </div>

                  <section className="explore-ai-preview explore-feed-preview">
                    <div className="section-row">
                      <strong>{t("exploreSignalNote")}</strong>
                      <span className="signal-chip">{t("exploreLive")}</span>
                    </div>
                    <p>{getLocalizedAiPreview(card)}</p>
                  </section>

                  <div className="inline-actions">
                    <Link className="primary-button" to={publicPath}>
                      {t("exploreOpenSignal")}
                    </Link>
                    {isOwnForm ? (
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => void handleDeleteForm(card.form.id, card.form.title)}
                        disabled={deletingFormId === card.form.id}
                      >
                        {deletingFormId === card.form.id ? t("deleting") : t("deleteForm")}
                      </button>
                    ) : null}
                  </div>
                  </article>
                </Fragment>
              );
            })}
          </section>
        )}
      </section>
    </section>
  );
}
