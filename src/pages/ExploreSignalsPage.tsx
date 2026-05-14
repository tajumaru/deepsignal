import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useMemo, useState } from "react";
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

type HiddenFormSummary = {
  id: string;
  title: string;
  visibility: FormSchema["visibility"];
  publicPath: string;
  responseDeadline?: FormSchema["responseDeadline"];
  ownerAddress?: string;
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
  const [hiddenForms, setHiddenForms] = useState<HiddenFormSummary[]>([]);
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
    const nextHiddenForms = allForms
      .filter((form) => !isFormPubliclyExplorable(form))
      .map((form) => ({
        id: form.id,
        title: form.title || "Untitled form",
        visibility: form.visibility,
        publicPath: getPublicFormPath(form.id, form.manifestBlobId),
        responseDeadline: form.responseDeadline,
        ownerAddress: form.ownerAddress,
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

  useEffect(() => {
    void loadExplore();
  }, []);

  function canDeleteForm(form: Pick<FormSchema, "creationMode" | "ownerAddress">) {
    return (
      form.creationMode === "guest" &&
      Boolean(account?.address && form.ownerAddress && form.ownerAddress.toLowerCase() === account.address.toLowerCase())
    );
  }

  function canOpenFormDashboard(form: Pick<FormSchema, "ownerAddress">) {
    return Boolean(account?.address && form.ownerAddress && form.ownerAddress.toLowerCase() === account.address.toLowerCase());
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

  const heroCountLabel = loading ? "Scanning public streams..." : `${filteredCards.length} signals in view`;

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
            <p className="eyebrow">Signal Directory</p>
            <h1>Explore Signals</h1>
            <p className="lede">Public feedback streams on Walrus.</p>
          </div>
          <div className="explore-hero-summary">
            <span className="signal-chip signal-chip-accent">{heroCountLabel}</span>
            <span className="signal-chip">{cards.length} listed</span>
            {hiddenForms.length > 0 ? <span className="signal-chip">{hiddenForms.length} hidden local</span> : null}
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
            <h2>No public signals yet.</h2>
            <p className="muted">
              {hiddenForms.length > 0
                ? `${hiddenForms.length} local signal${hiddenForms.length === 1 ? "" : "s"} found, but not listed in Public Explore.`
                : "Publish your first signal stream."}
            </p>
            {hiddenForms.length > 0 ? (
              <div className="explore-hidden-inline">
                {hiddenForms.slice(0, 2).map((form) => (
                  <div key={form.id} className="explore-hidden-inline-card">
                    <div className="explore-hidden-inline-main">
                      <div className="pill-row">
                        <span className="signal-chip signal-chip-accent">Detected</span>
                        <span className="signal-chip">{form.visibility === "private" ? "Private" : "Unlisted"}</span>
                      </div>
                      <strong>{form.title}</strong>
                      <p className="muted">
                        {form.visibility === "private" ? "Private: admin only" : "Unlisted: direct link only"}
                      </p>
                    </div>
                    <div className="explore-hidden-inline-stats">
                      <div className={`explore-deadline-pill is-${getDeadlineTone(form)}`}>
                        <span>Deadline</span>
                        <strong>{getDeadlineLabel(form)}</strong>
                      </div>
                    </div>
                    <div className="inline-actions">
                      <Link className="ghost-button" to={form.publicPath}>
                        Open direct
                      </Link>
                      {canOpenFormDashboard(form) ? (
                        <Link className="ghost-button" to={`/dashboard/forms/${form.id}`}>
                          Open dashboard
                        </Link>
                      ) : null}
                      {canDeleteForm(form) ? (
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => void handleDeleteForm(form.id, form.title)}
                          disabled={deletingFormId === form.id}
                        >
                          {deletingFormId === form.id ? "Deleting..." : "Delete"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="inline-actions">
              <CreateFormLink className="primary-button">
                Create signal
              </CreateFormLink>
              {hiddenForms.length > 0 ? (
                <Link className="ghost-button" to="/admin/forms/new">
                  Change visibility
                </Link>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="explore-card-grid">
            {filteredCards.map((card) => {
              const publicPath = getPublicFormPath(card.form.id, card.form.manifestBlobId);
              const creatorLabel = getCreatorLabel(card.form);
              const isOwnForm = canDeleteForm(card.form);

              return (
                <article key={card.form.id} className="panel glow-panel explore-card explore-feed-card">
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
              );
            })}
          </section>
        )}
      </section>
    </section>
  );
}
