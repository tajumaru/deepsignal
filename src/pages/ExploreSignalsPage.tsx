import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/pages/explore.css";
import "../styles/mobile/layout.css";
import "../styles/mobile/workspace.css";
import "../styles/mobile/signal.css";
import "../styles/mobile/lifecycle.css";
import "../styles/mobile/explore.css";
import { CreateFormLink } from "../components/CreateFormLink";
import { useI18n } from "../i18n";
import { buildExploreAiPreview, getExploreCategory, isFormPubliclyExplorable, type ExploreCategory } from "../lib/explore";
import { normalizeForm } from "../lib/formSchema";
import { getPublicFormPath } from "../lib/publicLinks";
import { isResponseDeadlinePassed } from "../lib/responseDeadline";
import { endPerf, markPerfMilestone, startPerf } from "../lib/perf";
import {
  logRouteLifecycle,
  setDeepSignalBrowserCapabilities,
  setDeepSignalCacheRestoreSource,
  setDeepSignalDebugReadiness,
} from "../lib/routeDiagnostics";
import { formatDate } from "../lib/utils";
import { localStorageAdapter } from "../storage/localStorageAdapter";
import type { FormSchema, Submission } from "../types";

type ExploreCard = {
  form: FormSchema;
  category: ExploreCategory;
  signalCount: number;
  updatedAt: string;
  roadmapCount: number;
};

type DiscoverTab = "trending" | "new" | "active" | "ai" | "governance" | "anonymous" | "encrypted";
type ExploreReadiness = {
  workspaceReady: boolean;
  providerReady: boolean;
  routeHydrated: boolean;
  storageHydrated: boolean;
};

const EXPLORE_DELETED_FORMS_KEY = "deepsignal.exploreDeletedForms";
const EXPLORE_SUBMISSION_LOAD_CONCURRENCY = 4;
const EXPLORE_ROUTE_HYDRATION_RETRY_MS = 1600;

const DISCOVER_TABS: DiscoverTab[] = ["trending", "new", "active", "ai", "governance", "anonymous", "encrypted"];
const INITIAL_READINESS: ExploreReadiness = {
  workspaceReady: false,
  providerReady: false,
  routeHydrated: false,
  storageHydrated: false,
};

function allReadinessReady(readiness: ExploreReadiness) {
  return readiness.workspaceReady && readiness.providerReady && readiness.routeHydrated && readiness.storageHydrated;
}

function getNavigatorUserAgent() {
  return typeof navigator === "undefined" ? "unknown" : navigator.userAgent;
}

function getBrowserCapabilities() {
  if (typeof window === "undefined") {
    return {
      requestIdleCallback: false,
      indexedDB: false,
      localStorage: false,
      cryptoSubtle: false,
      bigInt: false,
      visibilityState: "unknown",
    };
  }

  let localStorageAvailable = false;
  try {
    const key = "deepsignal.explore.storageProbe";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    localStorageAvailable = true;
  } catch {
    localStorageAvailable = false;
  }

  return {
    requestIdleCallback: "requestIdleCallback" in window,
    indexedDB: "indexedDB" in window,
    localStorage: localStorageAvailable,
    cryptoSubtle: Boolean(window.crypto?.subtle),
    bigInt: typeof BigInt === "function",
    visibilityState: document.visibilityState,
  };
}

function scheduleAfterPaint(callback: () => void) {
  if (typeof window === "undefined") {
    callback();
    return () => undefined;
  }
  const raf = window.requestAnimationFrame ?? ((handler: FrameRequestCallback) => window.setTimeout(() => handler(performance.now()), 16));
  const cancelRaf = window.cancelAnimationFrame ?? window.clearTimeout;
  const id = raf(() => callback());
  return () => cancelRaf(id);
}

function getStableIsoDate(value: unknown, fallback = new Date(0).toISOString()) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  return Number.isFinite(new Date(value).getTime()) ? value : fallback;
}

function compareIsoDateDesc(left: string, right: string) {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
}

function getCreatorLabel(form: FormSchema, localCreatorLabel: string) {
  if (typeof form.projectName === "string" && form.projectName.trim()) {
    return form.projectName.trim();
  }
  if (typeof form.ownerAddress === "string" && form.ownerAddress) {
    return `${form.ownerAddress.slice(0, 6)}…${form.ownerAddress.slice(-4)}`;
  }
  return localCreatorLabel;
}

function matchesKeyword(form: FormSchema, keywords: string[]) {
  const haystack = [form?.title, form?.description, form?.projectName]
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

function getMetricCaption(label: string, count: number) {
  return label.replace(String(count), "").replace(/^[\s:：-]+|[\s:：-]+$/g, "") || label;
}

function readExploreDeletedFormIds() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }
  try {
    const raw = window.localStorage.getItem(EXPLORE_DELETED_FORMS_KEY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    setDeepSignalCacheRestoreSource(raw ? "localStorage:exploreDeletedForms" : "localStorage:empty");
    return new Set(ids.filter((id) => typeof id === "string" && id.trim()));
  } catch (error) {
    logRouteLifecycle("explore:deleted-cache:parse-failed", { error });
    try {
      window.localStorage.removeItem(EXPLORE_DELETED_FORMS_KEY);
      setDeepSignalCacheRestoreSource("localStorage:exploreDeletedForms-reset");
      const retryRaw = window.localStorage.getItem(EXPLORE_DELETED_FORMS_KEY);
      const retryIds = retryRaw ? (JSON.parse(retryRaw) as string[]) : [];
      return new Set(retryIds.filter((id) => typeof id === "string" && id.trim()));
    } catch (retryError) {
      logRouteLifecycle("explore:deleted-cache:retry-failed", { error: retryError });
    }
    return new Set<string>();
  }
}

function buildExploreCard(form: FormSchema, submissions: Submission[] = []): ExploreCard {
  const safeSubmissions = Array.isArray(submissions) ? submissions.filter(Boolean) : [];
  const latestSubmission = safeSubmissions
    .filter(Boolean)
    .sort((left, right) =>
      compareIsoDateDesc(
        getStableIsoDate(left.updatedAt ?? left.createdAt),
        getStableIsoDate(right.updatedAt ?? right.createdAt),
      ),
    )[0];
  const updatedAt = getStableIsoDate(latestSubmission?.updatedAt ?? latestSubmission?.createdAt ?? form.updatedAt ?? form.createdAt);
  const exploreCategory = getExploreCategory(form);
  const roadmapCount = safeSubmissions
    .filter(Boolean)
    .filter((submission) =>
      submission.triageStatus === "planned" ||
      submission.triageStatus === "in_progress" ||
      submission.triageStatus === "fixed",
    ).length;

  return {
    form,
    category: exploreCategory,
    signalCount: safeSubmissions.length,
    updatedAt,
    roadmapCount,
  };
}

export function ExploreSignalsPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<ExploreCard[]>([]);
  const [loadIssue, setLoadIssue] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DiscoverTab>("trending");
  const [readiness, setReadiness] = useState<ExploreReadiness>(INITIAL_READINESS);
  const loadSequenceRef = useRef(0);
  const hydrationRetryRef = useRef(0);
  const loadRetryRef = useRef(0);
  const readinessReadyRef = useRef(false);
  const readyToRenderExplore = allReadinessReady(readiness);

  const loadExplore = useCallback(async () => {
    if (!readyToRenderExplore) {
      logRouteLifecycle("explore:load:deferred", { readiness });
      return;
    }
    const loadSequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = loadSequence;
    setLoading(true);
    setLoadIssue(null);
    startPerf("explore:cache-restore");
    logRouteLifecycle("explore:load:start", { sequence: loadSequence });
    try {
      const allStorageForms = await localStorageAdapter.listForms();
      if (loadSequenceRef.current !== loadSequence) {
        logRouteLifecycle("explore:load:stale", { sequence: loadSequence, stage: "forms" });
        return;
      }

      const deletedFormIds = readExploreDeletedFormIds();
      const normalizedForms = (Array.isArray(allStorageForms) ? allStorageForms : [])
        .filter((form): form is FormSchema => Boolean(form && typeof form === "object" && typeof form.id === "string"))
        .filter((form) => !deletedFormIds.has(form.id))
        .reduce<FormSchema[]>((nextForms, form) => {
          try {
            nextForms.push(normalizeForm(form));
          } catch (error) {
            logRouteLifecycle("explore:form:normalize-failed", { formId: form.id, error });
          }
          return nextForms;
        }, []);
      const forms = normalizedForms.filter((form) => isFormPubliclyExplorable(form));
      setCards(forms.map((form) => buildExploreCard(form)));
      setLoading(false);
      loadRetryRef.current = 0;
      endPerf("explore:cache-restore", "ok", `${forms.length} forms`);
      markPerfMilestone("explore:ready", `${forms.length} forms`);
      logRouteLifecycle("explore:load:forms-ready", { sequence: loadSequence, formCount: forms.length });

      let nextFormIndex = 0;
      const workerCount = Math.min(EXPLORE_SUBMISSION_LOAD_CONCURRENCY, forms.length);
      await Promise.allSettled(
        Array.from({ length: workerCount }, async (_, workerIndex) => {
          while (nextFormIndex < forms.length) {
            const form = forms[nextFormIndex];
            nextFormIndex += 1;
            if (!form) {
              continue;
            }
            try {
              const rawSubmissions = await localStorageAdapter.listSubmissions(form.id);
              const submissions = Array.isArray(rawSubmissions)
                ? rawSubmissions.filter((submission): submission is Submission => Boolean(submission && typeof submission === "object"))
                : [];
              if (loadSequenceRef.current !== loadSequence) {
                logRouteLifecycle("explore:load:stale", { sequence: loadSequence, stage: "submissions", workerIndex });
                return;
              }
              setCards((currentCards) =>
                currentCards.map((card) =>
                  card.form.id === form.id ? buildExploreCard(form, submissions) : card,
                ),
              );
            } catch (error) {
              logRouteLifecycle("explore:submissions:load-failed", { sequence: loadSequence, formId: form.id, workerIndex, error });
            }
          }
        }),
      );
      logRouteLifecycle("explore:load:complete", { sequence: loadSequence, formCount: forms.length });
    } catch (error) {
      endPerf("explore:cache-restore", "failed", error instanceof Error ? error.message : String(error));
      logRouteLifecycle("explore:load:failed", { sequence: loadSequence, error });
      if (loadRetryRef.current < 1) {
        loadRetryRef.current += 1;
        logRouteLifecycle("explore:load:retry", { sequence: loadSequence, retry: loadRetryRef.current });
        window.setTimeout(() => void loadExplore(), 250);
        return;
      }
      if (loadSequenceRef.current === loadSequence) {
        setLoadIssue(error instanceof Error ? error.message : "Explore data could not be loaded.");
        setLoading(false);
      }
    }
  }, [readiness, readyToRenderExplore]);

  useEffect(() => {
    logRouteLifecycle("explore:mount", { userAgent: getNavigatorUserAgent() });
    return () => {
      loadSequenceRef.current += 1;
      logRouteLifecycle("explore:unmount");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cancelAfterPaint = scheduleAfterPaint(() => {
      if (cancelled) {
        return;
      }

      const capabilities = getBrowserCapabilities();
      setDeepSignalBrowserCapabilities(capabilities);
      setReadiness({
        routeHydrated: true,
        storageHydrated: true,
        providerReady: true,
        workspaceReady: true,
      });
      readinessReadyRef.current = true;
      setDeepSignalDebugReadiness({
        route: "explore",
        workspaceReady: true,
        providerReady: true,
        routeHydrated: true,
        storageHydrated: true,
        localStorageAvailable: capabilities.localStorage,
        walletSession: "not-required",
        walrusClient: "not-required",
        inboxState: "local-fallback",
        streams: "local-forms",
      });
      logRouteLifecycle("explore:hydration:ready", capabilities);
    });

    const retryTimer = window.setTimeout(() => {
      if (cancelled || readinessReadyRef.current || hydrationRetryRef.current >= 1) {
        return;
      }
      hydrationRetryRef.current += 1;
      logRouteLifecycle("explore:hydration:retry", { retry: hydrationRetryRef.current });
      const capabilities = getBrowserCapabilities();
      setDeepSignalBrowserCapabilities(capabilities);
      setReadiness({
        routeHydrated: true,
        storageHydrated: true,
        providerReady: true,
        workspaceReady: true,
      });
      readinessReadyRef.current = true;
    }, EXPLORE_ROUTE_HYDRATION_RETRY_MS);

    return () => {
      cancelled = true;
      cancelAfterPaint();
      window.clearTimeout(retryTimer);
    };
  }, []);

  useEffect(() => {
    if (readyToRenderExplore) {
      void loadExplore();
    }
  }, [loadExplore, readyToRenderExplore]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      logRouteLifecycle("explore:visibilitychange", { visibilityState: document.visibilityState });
      if (document.visibilityState === "visible" && readyToRenderExplore && cards.length === 0 && !loading) {
        void loadExplore();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [cards.length, loadExplore, loading, readyToRenderExplore]);

  const filteredCards = useMemo(() => {
    const safeCards = Array.isArray(cards) ? cards.filter((card) => card?.form?.id) : [];
    const next = safeCards.filter((card) => {
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
        return (Number.isFinite(rightUpdated) ? rightUpdated : 0) - (Number.isFinite(leftUpdated) ? leftUpdated : 0);
      }

      const leftScore = left.signalCount * 3 + left.roadmapCount * 2 + (Number.isFinite(leftUpdated) && Date.now() - leftUpdated < 1000 * 60 * 60 * 24 ? 8 : 0);
      const rightScore = right.signalCount * 3 + right.roadmapCount * 2 + (Number.isFinite(rightUpdated) && Date.now() - rightUpdated < 1000 * 60 * 60 * 24 ? 8 : 0);
      return rightScore - leftScore || (Number.isFinite(rightUpdated) ? rightUpdated : 0) - (Number.isFinite(leftUpdated) ? leftUpdated : 0);
    });

    return sorted;
  }, [activeTab, cards]);

  const heroCountLabel = loading
    ? t("exploreScanningWorkspace")
    : t("exploreSignalsInView", { count: filteredCards.length });
  const heroCountCaption = loading ? t("exploreRefreshingFeed") : getMetricCaption(heroCountLabel, filteredCards.length);
  const listedCountLabel = t("exploreListedHere", { count: cards.length });
  const listedCountCaption = getMetricCaption(listedCountLabel, cards.length);

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

  function getDiscoverTabMobileLabel(tab: DiscoverTab) {
    return tab === "governance" ? t("exploreTabGovernanceShort") : getDiscoverTabLabel(tab);
  }

  function getLocalizedPurposeLabel(form: FormSchema) {
    switch (form?.purpose) {
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
    if (!form || typeof form.responseDeadline !== "number" || !Number.isFinite(form.responseDeadline)) {
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

  function getDiscoverTabIcon(tab: DiscoverTab) {
    switch (tab) {
      case "trending":
        return "↗";
      case "new":
        return "☆";
      case "active":
        return "⌁";
      case "ai":
        return "✣";
      case "governance":
        return "◇";
      case "anonymous":
        return "◌";
      case "encrypted":
        return "▣";
    }
  }

  if (!readyToRenderExplore) {
    return (
      <section className="explore-shell">
        <section className="panel glow-panel explore-hero explore-hero-compact">
          <div className="explore-hero-bar">
            <div className="explore-hero-copy">
              <p className="eyebrow">{t("exploreEyebrow")}</p>
              <h1>{t("exploreTitle")}</h1>
              <p className="lede">{t("exploreLede")}</p>
              <p className="muted explore-hero-note">{t("exploreScanningWorkspace")}</p>
            </div>
            <div className="explore-hero-summary">
              <span className="signal-chip signal-chip-accent">{t("exploreRefreshingFeed")}</span>
            </div>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="explore-shell">
      <section className="panel glow-panel explore-hero explore-hero-compact">
        <div className="explore-grid-overlay" aria-hidden="true" />
        <div className="explore-scanlines" aria-hidden="true" />
        <div className="explore-dataflow" aria-hidden="true" />
        <div className="explore-radar-sweep" aria-hidden="true" />
        <div className="explore-grid-glow" aria-hidden="true" />
        <div className="explore-radar-display" aria-hidden="true">
          <span className="explore-radar-core" />
          <span className="explore-radar-beam" />
          <span className="explore-radar-link" />
        </div>
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
            <div className="explore-summary-card">
              <span className="explore-summary-icon" aria-hidden="true">◎</span>
              <strong>{loading ? "..." : filteredCards.length}</strong>
              <span>{heroCountCaption}</span>
            </div>
            <div className="explore-summary-card">
              <span className="explore-summary-icon" aria-hidden="true">▤</span>
              <strong>{cards.length}</strong>
              <span>{listedCountCaption}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="panel glow-panel explore-discovery-panel">
        <div className="explore-discovery-bar">
          <div className="explore-stream-console-label">{t("exploreStreamConsoleLabel")}</div>
          <div className="explore-tab-row" role="tablist" aria-label={t("exploreTabsAria")}>
            {DISCOVER_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`explore-tab explore-tab-${tab} ${activeTab === tab ? "is-active" : ""}`}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
              >
                <span className="explore-tab-icon" aria-hidden="true">{getDiscoverTabIcon(tab)}</span>
                <span className="explore-tab-label">{getDiscoverTabLabel(tab)}</span>
                <span className="explore-tab-label-mobile">{getDiscoverTabMobileLabel(tab)}</span>
              </button>
            ))}
          </div>
          <div className="explore-feed-meta">
            <span>{loading ? t("exploreRefreshingFeed") : t("exploreVisibleCount", { count: filteredCards.length })}</span>
            <span className="explore-sort-chip">
              <span>{t("exploreSortBy")}</span>
              <strong>{activeTab === "new" ? t("exploreTabNew") : t("exploreTabTrending")}</strong>
            </span>
          </div>
        </div>

        {filteredCards.length === 0 ? (
          <section className="explore-empty-minimal">
            <h2>{t("exploreEmptyTitle")}</h2>
            <div className="explore-empty-copy">
              {loadIssue ? (
                <p className="muted">
                  Explore recovered without clearing local fallback data. Diagnostic: {loadIssue}
                </p>
              ) : null}
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
                      <span>{t("exploreOpenSignal")}</span>
                      <span aria-hidden="true">→</span>
                    </Link>
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
