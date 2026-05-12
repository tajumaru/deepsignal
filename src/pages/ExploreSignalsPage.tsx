import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { buildExploreAiPreview, getExploreCategory, getPurposeLabel, isFormPubliclyExplorable, type ExploreCategory, type ExploreTabKey } from "../lib/explore";
import { getPublicFormPath } from "../lib/publicLinks";
import { normalizeForm, normalizeSubmission, storageAdapter } from "../lib/storage";
import { formatDate } from "../lib/utils";
import type { FormSchema, Submission } from "../types";

type ExploreCard = {
  form: FormSchema;
  category: ExploreCategory;
  signalCount: number;
  updatedAt: string;
  aiPreview: string;
  roadmapCount: number;
};

const TABS: Array<{ key: ExploreTabKey; label: string }> = [
  { key: "trending", label: "Trending" },
  { key: "recent", label: "Recent" },
  { key: "active", label: "Most Active" },
  { key: "ai", label: "AI Summaries" },
];

const CATEGORIES: ExploreCategory[] = ["All", "Bug", "Feature", "Survey", "Application"];

export function ExploreSignalsPage() {
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<ExploreTabKey>("trending");
  const [category, setCategory] = useState<ExploreCategory>("All");
  const [cards, setCards] = useState<ExploreCard[]>([]);

  useEffect(() => {
    async function loadExplore() {
      const forms = (await storageAdapter.listForms())
        .map((form) => normalizeForm(form))
        .filter((form) => isFormPubliclyExplorable(form));

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

    void loadExplore();
  }, []);

  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const matching = cards.filter((card) => {
      if (category !== "All" && card.category !== category) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const haystack = [
        card.form.title,
        card.form.description,
        card.form.projectName,
        card.category,
        getPurposeLabel(card.form.purpose),
        card.aiPreview,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    const sorted = [...matching];
    sorted.sort((left, right) => {
      const leftUpdated = new Date(left.updatedAt).getTime();
      const rightUpdated = new Date(right.updatedAt).getTime();
      if (tab === "recent") {
        return rightUpdated - leftUpdated;
      }
      if (tab === "active") {
        return right.signalCount - left.signalCount || rightUpdated - leftUpdated;
      }
      if (tab === "ai") {
        return right.aiPreview.length - left.aiPreview.length || right.signalCount - left.signalCount;
      }
      const leftScore = left.signalCount * 3 + (Date.now() - leftUpdated < 1000 * 60 * 60 * 24 ? 8 : 0);
      const rightScore = right.signalCount * 3 + (Date.now() - rightUpdated < 1000 * 60 * 60 * 24 ? 8 : 0);
      return rightScore - leftScore || rightUpdated - leftUpdated;
    });
    return sorted;
  }, [cards, category, query, tab]);

  if (loading) {
    return <div className="panel">Scanning Walrus signal network...</div>;
  }

  return (
    <section className="explore-shell">
      <section className="panel glow-panel explore-hero">
        <div className="explore-grid-overlay" aria-hidden="true" />
        <div className="explore-hero-copy">
          <p className="eyebrow">Walrus Network</p>
          <h1>Explore Signals</h1>
          <p className="lede">Discover public feedback streams stored on Walrus.</p>
          <div className="explore-hero-meta">
            <span className="signal-chip signal-chip-accent">{cards.length} public streams</span>
            <span className="signal-chip">Live feedback stream</span>
            <span className="signal-chip">AI Observatory</span>
          </div>
        </div>
        <div className="explore-hero-panel">
          <div className="explore-terminal-line">
            <span className="explore-pulse-dot" />
            <strong>Signal Terminal</strong>
            <span>{cards.reduce((sum, card) => sum + card.signalCount, 0)} signals indexed</span>
          </div>
          <div className="explore-terminal-stack">
            <div>
              <span>Visibility filter</span>
              <strong>Public Explore only</strong>
            </div>
            <div>
              <span>Safe surface</span>
              <strong>Metadata only, no private payloads</strong>
            </div>
            <div>
              <span>Source</span>
              <strong>Walrus-native forms + local fallback compatibility</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="panel glow-panel explore-toolbar">
        <label className="explore-search">
          <span className="sr-only">Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects, forms, signals..."
          />
        </label>

        <div className="explore-tab-row" role="tablist" aria-label="Explore tabs">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`explore-tab ${tab === item.key ? "is-active" : ""}`}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="explore-filter-row" aria-label="Category filters">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              className={`signal-chip explore-filter-chip ${category === item ? "is-active" : ""}`}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      {filteredCards.length === 0 ? (
        <section className="panel glow-panel explore-empty">
          <p className="eyebrow">No public streams detected</p>
          <h2>Nothing matches the current scan.</h2>
          <p className="muted">Try another query or switch a form to Public Explore from Create Form.</p>
        </section>
      ) : (
        <section className="explore-card-grid">
          {filteredCards.map((card) => {
            const publicPath = getPublicFormPath(card.form.id, card.form.manifestBlobId);
            const roadmapPath = `/roadmap/${card.form.id}${card.form.manifestBlobId ? `?manifest=${card.form.manifestBlobId}` : ""}`;
            return (
              <article key={card.form.id} className="panel glow-panel explore-card">
                <div className="explore-card-head">
                  <div>
                    <div className="pill-row">
                      <span className="signal-chip signal-chip-accent">Public</span>
                      <span className="signal-chip">{getPurposeLabel(card.form.purpose)}</span>
                      <span className="signal-chip">Walrus</span>
                    </div>
                    <h2>{card.form.title}</h2>
                    <p className="muted">{card.form.description || "Public signal stream available for new feedback."}</p>
                  </div>
                  <div className="explore-card-count">
                    <strong>{card.signalCount}</strong>
                    <span>signals</span>
                  </div>
                </div>

                <div className="explore-card-meta">
                  <span className="signal-chip">{card.category}</span>
                  <span className="signal-chip">Updated {formatDate(card.updatedAt)}</span>
                  <span className="signal-chip">{card.roadmapCount} roadmap items</span>
                </div>

                <section className="explore-ai-preview">
                  <div className="section-row">
                    <strong>AI Summary</strong>
                    <span className="signal-chip">Metadata only</span>
                  </div>
                  <p>{card.aiPreview}</p>
                </section>

                <div className="inline-actions">
                  <Link className="primary-button" to={publicPath}>
                    Open Form
                  </Link>
                  <Link className="ghost-button" to={roadmapPath}>
                    View Roadmap
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </section>
  );
}
