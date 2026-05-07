import { Link } from "react-router-dom";

const featureCards = [
  {
    title: "Create Forms",
    body: "Build custom feedback forms with fields, ratings, files, and URLs.",
  },
  {
    title: "Collect Signals",
    body: "Share a link and collect feedback from users.",
  },
  {
    title: "Review Insights",
    body: "Review submitted feedback in a private dashboard.",
  },
];

const signalMetrics = [
  { label: "Signal Forms", value: "Custom" },
  { label: "Submission Flow", value: "Live" },
  { label: "Storage Layer", value: "Walrus" },
];

export function LandingPage() {
  return (
    <section className="landing-shell">
      <div className="hero-layout landing-hero">
        <div className="hero-copy panel glow-panel landing-copy">
          <p className="eyebrow">Deep-Sea Feedback Interface</p>
          <h1>DeepSignal</h1>
          <p className="landing-tagline">Feedback signals from the deep. Stored on Walrus.</p>
          <p className="lede">
            Create feedback forms, collect submissions, and preserve every signal on
            Walrus.
          </p>
          <div className="cta-row">
            <Link className="primary-button" to="/admin/forms/new">
              Create Signal
            </Link>
            <Link className="ghost-button" to="/dashboard">
              Explore Dashboard
            </Link>
          </div>
          <div className="signal-stat-row" aria-label="DeepSignal capabilities">
            {signalMetrics.map((item) => (
              <div key={item.label} className="signal-stat-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="panel glow-panel signal-visual-panel" aria-hidden="true">
          <div className="signal-visual">
            <div className="signal-ring signal-ring-a" />
            <div className="signal-ring signal-ring-b" />
            <div className="signal-ring signal-ring-c" />
            <div className="signal-sweep" />
            <div className="signal-grid" />
            <div className="signal-core" />
            <span className="signal-dot signal-dot-a" />
            <span className="signal-dot signal-dot-b" />
            <span className="signal-dot signal-dot-c" />
            <span className="signal-dot signal-dot-d" />
            <svg
              className="signal-waveform"
              viewBox="0 0 420 180"
              role="presentation"
              focusable="false"
            >
              <path
                d="M0 102C22 102 22 75 44 75C66 75 66 122 88 122C110 122 110 64 132 64C154 64 154 130 176 130C198 130 198 84 220 84C242 84 242 115 264 115C286 115 286 52 308 52C330 52 330 109 352 109C374 109 374 92 396 92C408 92 414 96 420 101"
                pathLength="100"
              />
            </svg>
            <div className="signal-readout">
              <span>Listening for new feedback</span>
              <strong>Walrus signal lock</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="card-grid landing-feature-grid">
        {featureCards.map((feature) => (
          <article key={feature.title} className="panel feature-card">
            <div className="feature-icon" aria-hidden="true" />
            <h2>{feature.title}</h2>
            <p>{feature.body}</p>
          </article>
        ))}
      </div>

      <div className="landing-lower-grid">
        <section className="panel glow-panel landing-empty-state">
          <p className="eyebrow">Signal Status</p>
          <h2>No signals detected yet.</h2>
          <p>Create your first form to start listening.</p>
          <Link className="primary-button" to="/admin/forms/new">
            Create Signal
          </Link>
        </section>

        <section className="panel landing-info-card">
          <p className="eyebrow">How It Works</p>
          <h2>From intake to preserved insight</h2>
          <p className="lede">
            DeepSignal gives teams a Walrus-native path to launch forms, collect
            submissions, and review feedback inside a private dashboard without changing
            the existing flow.
          </p>
          <div className="info-pills" aria-label="DeepSignal flow">
            <span className="signal-chip">Create a form</span>
            <span className="signal-chip">Share a link</span>
            <span className="signal-chip">Collect submissions</span>
            <span className="signal-chip">Store on Walrus</span>
          </div>
        </section>
      </div>
    </section>
  );
}
