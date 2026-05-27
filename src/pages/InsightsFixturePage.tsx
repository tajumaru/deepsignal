import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  INSIGHTS_FIXTURE_ENTRY_FORM_ID,
  INSIGHTS_FIXTURE_FORM_IDS,
  INSIGHTS_FIXTURE_PROJECT_ID,
  buildInsightsFixtureSubmissions,
  clearInsightsFixtureWorkspace,
  getInsightsFixtureMeta,
  seedInsightsFixtureWorkspace,
  type InsightsFixtureMeta,
  type InsightsFixtureMode,
} from "../demo/insightsFixtureData";

const FIXTURE_MODES: Array<{
  id: InsightsFixtureMode;
  title: string;
  description: string;
  expected: string;
}> = [
  {
    id: "tokyo_earthquake",
    title: "Tokyo Earthquake Demo",
    description: "High-urgency disaster signals with location clustering, contradictory safety states, and missing response risk.",
    expected: "Urgency / location cluster / response gap",
  },
  {
    id: "internal_risk",
    title: "Internal Risk Demo",
    description: "Emotional internal reports with escalation pressure, contradictory evidence, and affected-team clustering.",
    expected: "Escalation risk / emotional tone / team cluster",
  },
  {
    id: "product_feedback",
    title: "Product Feedback Demo",
    description: "Repeated friction, strong sentiment, one positive momentum signal, and outlier behavior for AI analysis pickup.",
    expected: "Friction cluster / anomaly / product opportunity",
  },
  {
    id: "combined",
    title: "Combined Analysis Workspace",
    description: "Loads all three analysis demos together so the reviewer can compare signalType and analystType lenses in one workspace.",
    expected: "Signal Intelligence workspace in one pass",
  },
];

export function InsightsFixturePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Ready");
  const [busyMode, setBusyMode] = useState<InsightsFixtureMode | "clear" | null>(null);
  const [autoOpenInsights, setAutoOpenInsights] = useState(true);
  const [fixtureMeta, setFixtureMeta] = useState<InsightsFixtureMeta | null>(null);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FIXTURE_MODES.map((mode) => [mode.id, buildInsightsFixtureSubmissions(mode.id).length]),
      ) as Record<InsightsFixtureMode, number>,
    [],
  );

  useEffect(() => {
    setFixtureMeta(getInsightsFixtureMeta());
  }, []);

  async function handleSeed(mode: InsightsFixtureMode) {
    setBusyMode(mode);
    setStatus(`Seeding ${mode} fixture into browser-local storage...`);
    try {
      const result = await seedInsightsFixtureWorkspace(mode);
      setFixtureMeta(result);
      setStatus(
        `Fixture ready: ${result.mode} seeded with ${result.submissionCount} local signals across ${result.formIds.length} forms. Open Insights in /dashboard to verify the analysis view.`,
      );
      if (autoOpenInsights) {
        navigate("/dashboard?tab=insights&scope=all");
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Fixture seed failed: ${error.message}`
          : "Fixture seed failed.",
      );
    } finally {
      setBusyMode(null);
    }
  }

  async function handleClear() {
    setBusyMode("clear");
    setStatus("Clearing fixture form from browser-local storage...");
    try {
      await clearInsightsFixtureWorkspace();
      setFixtureMeta(null);
      setStatus("Fixture data cleared. Existing non-fixture local data was left untouched.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Fixture clear failed: ${error.message}`
          : "Fixture clear failed.",
      );
    } finally {
      setBusyMode(null);
    }
  }

  return (
    <section className="stack">
      <section className="panel glow-panel">
        <p className="eyebrow">Dev Fixture</p>
        <h1>Insights Signal Fixture Seeder</h1>
        <p className="lede">
          Browser-local fixture seeding for validating State Overview, Activity Wave, Anomaly Detection,
          signal-specific analysis summaries, and intelligence-first signal cards without touching Walrus, Sui, or Seal.
        </p>
        <div className="workspace-hero-meta">
          <span className="workspace-meta-item">Storage: localStorage only</span>
          <span className="workspace-meta-item">Project: {INSIGHTS_FIXTURE_PROJECT_ID}</span>
          <span className="workspace-meta-item">Forms: {INSIGHTS_FIXTURE_FORM_IDS.length}</span>
          <span className="workspace-meta-item">
            Current mode: {fixtureMeta?.mode ?? "none"}
          </span>
        </div>
      </section>

      <section className="panel">
        <div className="workspace-signal-summary-header">
          <div>
            <p className="eyebrow">Modes</p>
            <h2>Seed patterns for Insights verification</h2>
          </div>
          <span className="signal-chip signal-chip-soft">Local only</span>
        </div>
        <label className="review-select export-select">
          <span>After seed</span>
          <select
            value={autoOpenInsights ? "insights" : "stay"}
            onChange={(event) => setAutoOpenInsights(event.target.value === "insights")}
          >
            <option value="insights">Open isolated Insights</option>
            <option value="stay">Stay on fixture page</option>
          </select>
        </label>
        <div className="workspace-signal-summary-grid">
          {FIXTURE_MODES.map((mode) => (
            <article key={mode.id} className="workspace-signal-answer-card">
              <div>
                <span>{mode.title}</span>
                <strong>{mode.id}</strong>
                <p className="workspace-signal-summary-empty">{mode.description}</p>
                <div className="workspace-cluster-keywords">
                  <small>{counts[mode.id]} signals</small>
                  <small>{mode.expected}</small>
                </div>
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={busyMode !== null}
                onClick={() => void handleSeed(mode.id)}
              >
                {busyMode === mode.id ? "Seeding..." : "Seed"}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="workspace-signal-summary-header">
          <div>
            <p className="eyebrow">Current fixture</p>
            <h2>Latest seeded mode</h2>
          </div>
          <span className="signal-chip signal-chip-soft">{fixtureMeta ? "Active" : "Idle"}</span>
        </div>
        {fixtureMeta ? (
          <div className="workspace-monitor-empty">
            <strong>{fixtureMeta.mode}</strong>
            <span>{fixtureMeta.submissionCount} local signals seeded</span>
            <p>
              Seeded at {new Date(fixtureMeta.seededAt).toLocaleString()} across {fixtureMeta.formIds.join(", ")}.
            </p>
          </div>
        ) : (
          <div className="workspace-monitor-empty">
            <strong>No active fixture</strong>
            <span>ready</span>
            <p>Seed one of the observatory modes to validate Insights with isolated local-only data.</p>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="workspace-signal-summary-header">
          <div>
            <p className="eyebrow">Safety</p>
            <h2>Isolation notes</h2>
          </div>
        </div>
        <div className="stack">
          <p>These fixtures write only to the browser-local fallback store and use a dedicated form/project id.</p>
          <p>No production database, Walrus blob, Sui object, or Seal dependency is required.</p>
          <p>Re-seeding first removes only this fixture form so it does not mix with the generated observatory set.</p>
        </div>
        <div className="inline-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={busyMode !== null}
            onClick={() => void handleClear()}
          >
            {busyMode === "clear" ? "Clearing..." : "Clear fixture"}
          </button>
          <Link
            className="ghost-button"
            to="/dashboard?tab=insights&scope=all"
          >
            Open analysis workspace
          </Link>
          <Link
            className="ghost-button"
            to="/dashboard?tab=review&scope=all"
          >
            Open signal inbox
          </Link>
          <Link className="ghost-button" to={`/dashboard?tab=review&form=${encodeURIComponent(INSIGHTS_FIXTURE_ENTRY_FORM_ID)}`}>
            Open earthquake fixture
          </Link>
        </div>
        <p className="muted">{status}</p>
      </section>
    </section>
  );
}
