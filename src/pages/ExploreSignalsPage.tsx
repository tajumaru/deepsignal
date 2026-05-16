import { useCurrentAccount } from "@mysten/dapp-kit";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CreateFormLink } from "../components/CreateFormLink";
import { buildExploreAiPreview, getExploreCategory, getPurposeLabel, isFormPubliclyExplorable, type ExploreCategory } from "../lib/explore";
import { getPublicFormPath } from "../lib/publicLinks";
import { isResponseDeadlinePassed } from "../lib/responseDeadline";
import { normalizeForm, normalizeSubmission, storageAdapter } from "../lib/storage";
import { formatDate } from "../lib/utils";
import type { FormSchema } from "../types";

type ExploreCard = {
  form: FormSchema;
  category: ExploreCategory;
  signalCount: number;
  updatedAt: string;
  aiPreview: string;
  roadmapCount: number;
};

type DiscoverTab = "trending" | "new" | "active" | "ai" | "governance" | "anonymous" | "encrypted";

const EXPLORE_DELETED_FORMS_KEY = "deepsignal.exploreDeletedForms";

const DISCOVER_TABS: Array<{ key: DiscoverTab; label: string }> = [
  { key: "trending", label: "Trending" },
  { key: "new", label: "New" },
  { key: "active", label: "Active" },
  { key: "ai", label: "AI" },
  { key: "governance", label: "Governance" },
  { key: "anonymous", label: "Anonymous" },
  { key: "encrypted", label: "Encrypted" },
];

function getCreatorLabel(form: FormSchema) {
  if (form.projectName?.trim()) {
    return form.projectName.trim();
  }
  if (form.ownerAddress) {
    return `${form.ownerAddress.slice(0, 6)}…${form.ownerAddress.slice(-4)}`;
  }
  return "Local creator";
}

function matchesKeyword(form: FormSchema, keywords: string[]) {
  const haystack = [form.title, form.description, form.projectName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

function getDeadlineLabel(form: Pick<FormSchema, "responseDeadline">) {
  if (typeof form.responseDeadline !== "number" || !Number.isFinite(form.responseDeadline)) {
    return "No deadline";
  }
  if (isResponseDeadlinePassed(form.responseDeadline)) {
    return "Closed";
  }
  return formatDate(new Date(form.responseDeadline).toISOString());
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

export function ExploreSignalsPage() {
  const account = useCurrentAccount();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<ExploreCard[]>([]);
  const [activeTab, setActiveTab] = useState<DiscoverTab>("trending");
  const [deletingFormId, setDeletingFormId] = useState("");

  async function loadExplore() {
    setLoading(true);
    const allStorageForms = await storageAdapter.listForms();
    const deletedFormIds = readExploreDeletedFormIds();
    const allForms: FormSchema[] = allStorageForms
      .filter((form) => !deletedFormIds.has(form.id))
      .map((form) => normalizeForm(form));
    const forms = allForms.filter((form) => isFormPubliclyExplorable(form));

    const nextCards = await Promise.all(
      forms.map(async (form) => {
        const submissions = (await storageAdapter.listSubmissions(form.id)).map((submission) => normalizeSubmission(submission));
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
          aiPreview: buildExploreAiPreview({
            category: exploreCategory,
            signalCount: submissions.length,
            updatedAt,
          }),
        } satisfies ExploreCard;
      }),
    );

    setCards(nextCards);
    setLoading(false);
  }

  useEffect(() => {
    void loadExplore();
  }, []);

  function canDeleteForm(form: Pick<FormSchema, "creationMode" | "ownerAddress">) {
    return (
      form.creationMode === "guest" &&
      Boolean(account?.address && form.ownerAddress && form.ownerAddress.toLowerCase() === account.address.toLowerCase())
    );
  }

  async function handleDeleteForm(formId: string, title: string) {
    if (!window.confirm(`Delete "${title || "Untitled form"}" from this browser?`)) {
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

  const heroCountLabel = loading ? "Scanning workspace streams..." : `${filteredCards.length} signals in view`;

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
            <p className="eyebrow">Workspace Signal Directory</p>
            <h1>Explore Signals</h1>
            <p className="lede">Public signal streams available in this workspace.</p>
            <p className="muted explore-hero-note">
              This view lists only forms intentionally published to Explore through the current storage runtime.
            </p>
          </div>
          <div className="explore-hero-summary">
            <span className="signal-chip signal-chip-accent">{heroCountLabel}</span>
            <span className="signal-chip">{cards.length} listed here</span>
          </div>
        </div>
      </section>

      <section className="panel glow-panel explore-discovery-panel">
        <div className="explore-discovery-bar">
          <div className="explore-tab-row" role="tablist" aria-label="Signal discovery tabs">
            {DISCOVER_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`explore-tab ${activeTab === tab.key ? "is-active" : ""}`}
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="explore-feed-meta">
            <span>{loading ? "Refreshing feed" : `${filteredCards.length} visible`}</span>
          </div>
        </div>

        {filteredCards.length === 0 ? (
          <section className="explore-empty-minimal">
            <h2>No listed signals in this workspace yet.</h2>
            <div className="explore-empty-copy">
              <p className="muted">
                Private and direct-link forms stay outside Explore unless their visibility is changed to Public Explore.
              </p>
              <p className="muted">
                Streams published to Explore will also show up here when they are available through the current storage runtime.
              </p>
            </div>
            <div className="inline-actions">
              <CreateFormLink className="primary-button">
                Create signal
              </CreateFormLink>
            </div>
          </section>
        ) : (
          <section className="explore-card-grid">
            {filteredCards.map((card) => {
              const publicPath = getPublicFormPath(card.form.id, card.form.manifestBlobId);
              const creatorLabel = getCreatorLabel(card.form);
              const isOwnForm = canDeleteForm(card.form);

              return (
                <Fragment key={card.form.id}>
                  <Link className="mobile-explore-row" to={publicPath}>
                    <span className="mobile-signal-avatar" aria-hidden="true">
                      {getPurposeLabel(card.form.purpose).slice(0, 2).toUpperCase()}
                      <span className={`mobile-signal-status-dot status-${card.signalCount > 0 ? "unread" : "archived"}`} />
                    </span>
                    <span className="mobile-signal-main">
                      <span className="mobile-signal-title-line">
                        <strong>{card.form.title}</strong>
                      </span>
                      <span className="mobile-signal-preview">
                        {card.form.description || "Public signal stream open for new feedback."}
                      </span>
                      <span className="mobile-signal-source-line">
                        <span>{creatorLabel}</span>
                        <span>{getPurposeLabel(card.form.purpose)}</span>
                      </span>
                      <span className="mobile-signal-meta-row">
                        <span className="mobile-signal-mini-badge">
                          {card.form.visibility === "public" ? "Listed" : "Unlisted"}
                        </span>
                        {card.form.encryptSubmissions ? <span className="mobile-signal-mini-badge">Encrypted</span> : null}
                        <span className="mobile-signal-mini-badge">{getDeadlineLabel(card.form)}</span>
                      </span>
                    </span>
                    <span className="mobile-signal-side">
                      <time>{formatDate(card.updatedAt)}</time>
                      <span className="mobile-priority-badge">{card.signalCount} resp</span>
                    </span>
                  </Link>

                  <article className="panel glow-panel explore-card explore-feed-card">
                  <div className="explore-card-ambient" aria-hidden="true" />

                  <div className="explore-feed-card-top">
                    <div>
                      <div className="pill-row">
                        <span className="signal-chip signal-chip-accent">Public</span>
                        <span className="signal-chip">{card.form.visibility === "public" ? "Listed" : "Unlisted"}</span>
                        {card.form.encryptSubmissions ? <span className="signal-chip">Encrypted</span> : null}
                      </div>
                      <h2>{card.form.title}</h2>
                    </div>
                    <div className="explore-feed-card-side">
                      <div className={`explore-deadline-pill is-${getDeadlineTone(card.form)}`}>
                        <span>Deadline</span>
                        <strong>{getDeadlineLabel(card.form)}</strong>
                      </div>
                      <div className="explore-card-count">
                        <strong>{card.signalCount}</strong>
                        <span>responses</span>
                      </div>
                    </div>
                  </div>

                  <p className="explore-feed-description muted">
                    {card.form.description || "Public signal stream open for new feedback."}
                  </p>

                  <div className="explore-feed-stats">
                    <div className="explore-feed-stat">
                      <span>Creator</span>
                      <strong>{creatorLabel}</strong>
                    </div>
                    <div className="explore-feed-stat">
                      <span>Latest</span>
                      <strong>{formatDate(card.updatedAt)}</strong>
                    </div>
                    <div className="explore-feed-stat">
                      <span>Category</span>
                      <strong>{getPurposeLabel(card.form.purpose)}</strong>
                    </div>
                    <div className="explore-feed-stat">
                      <span>Activity</span>
                      <strong>{card.roadmapCount} roadmap</strong>
                    </div>
                  </div>

                  <section className="explore-ai-preview explore-feed-preview">
                    <div className="section-row">
                      <strong>Signal note</strong>
                      <span className="signal-chip">Live</span>
                    </div>
                    <p>{card.aiPreview}</p>
                  </section>

                  <div className="inline-actions">
                    <Link className="primary-button" to={publicPath}>
                      Open signal
                    </Link>
                    {isOwnForm ? (
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => void handleDeleteForm(card.form.id, card.form.title)}
                        disabled={deletingFormId === card.form.id}
                      >
                        {deletingFormId === card.form.id ? "Deleting..." : "Delete"}
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
