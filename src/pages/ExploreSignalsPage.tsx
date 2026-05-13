import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { buildExploreAiPreview, getExploreCategory, getPurposeLabel, isFormPubliclyExplorable, type ExploreCategory } from "../lib/explore";
import { getPublicFormPath } from "../lib/publicLinks";
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

type HiddenFormSummary = {
  id: string;
  title: string;
  visibility: FormSchema["visibility"];
  publicPath: string;
};

export function ExploreSignalsPage() {
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<ExploreCard[]>([]);
  const [hiddenForms, setHiddenForms] = useState<HiddenFormSummary[]>([]);

  useEffect(() => {
    async function loadExplore() {
      const allForms: FormSchema[] = (await storageAdapter.listForms()).map((form) => normalizeForm(form));
      const forms = allForms.filter((form) => isFormPubliclyExplorable(form));
      const nextHiddenForms = allForms
        .filter((form) => !isFormPubliclyExplorable(form))
        .map((form) => ({
          id: form.id,
          title: form.title || "Untitled form",
          visibility: form.visibility,
          publicPath: getPublicFormPath(form.id, form.manifestBlobId),
        }));

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
      setHiddenForms(nextHiddenForms);
      setLoading(false);
    }

    void loadExplore();
  }, []);

  const filteredCards = useMemo(() => {
    const normalizedQuery = "";
    const category: ExploreCategory = "All";

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
      const leftScore = left.signalCount * 3 + (Date.now() - leftUpdated < 1000 * 60 * 60 * 24 ? 8 : 0);
      const rightScore = right.signalCount * 3 + (Date.now() - rightUpdated < 1000 * 60 * 60 * 24 ? 8 : 0);
      return rightScore - leftScore || rightUpdated - leftUpdated;
    });
    return sorted;
  }, [cards]);

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
      </section>

      {filteredCards.length === 0 ? (
        <section className="panel glow-panel explore-empty">
          <p className="eyebrow">No public streams detected</p>
          <h2>Nothing matches the current scan.</h2>
          <p className="muted">Try another query or switch a form to Public Explore from Create Form.</p>
          {hiddenForms.length > 0 ? (
            <>
              <div className="explore-hidden-summary">
                <span className="signal-chip signal-chip-accent">
                  {hiddenForms.length} hidden form{hiddenForms.length === 1 ? "" : "s"}
                </span>
                <p className="muted">
                  This browser still has saved forms, but they are currently hidden from Public Explore.
                </p>
              </div>
              <div className="explore-card-grid explore-hidden-grid">
                {hiddenForms.slice(0, 3).map((form) => (
                  <article key={form.id} className="panel glow-panel explore-card explore-card-muted">
                    <div className="explore-card-head">
                      <div>
                        <div className="pill-row">
                          <span className="signal-chip">Hidden</span>
                          <span className="signal-chip">{form.visibility === "private" ? "Private" : "Unlisted"}</span>
                          <span className="signal-chip">Saved locally</span>
                        </div>
                        <h2>{form.title}</h2>
                      </div>
                      <div className="explore-card-count">
                        <strong>0</strong>
                        <span>listed</span>
                      </div>
                    </div>
                    <section className="explore-ai-preview explore-muted-panel">
                      <div className="section-row">
                        <strong>Visibility note</strong>
                        <span className="signal-chip">{form.visibility === "private" ? "Admin only" : "Direct link only"}</span>
                      </div>
                      <p className="muted">
                        {form.visibility === "private"
                          ? "Private forms stay admin-only and never appear in Public Explore."
                          : "Unlisted forms can be opened directly, but they are excluded from the public directory."}
                      </p>
                    </section>
                    <div className="inline-actions">
                      <Link className="primary-button" to={form.publicPath}>
                        Open form directly
                      </Link>
                      <Link className="ghost-button" to="/create">
                        Change visibility
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}
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
