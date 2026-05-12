import { Link } from "react-router-dom";

const heroUseCases = ["Bug reports", "Feature requests", "Applications", "Surveys"];

const capabilityNotes = [
  "Wallet-optional responder flow",
  "Walrus-backed storage",
  "Optional private access",
];

const heroStatus = ["DEPTH 00", "SONAR LOCK", "RELAY STABLE"];

export function LandingPage() {
  return (
    <section className="landing-shell">
      <div className="landing-page-atmosphere" aria-hidden="true" />

      <section className="landing-hero-console panel glow-panel">
        <div className="landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="eyebrow">WALRUS-NATIVE FEEDBACK LAYER</p>

            <h1 className="landing-hero-title">
              <span>Deep</span>
              <span className="landing-hero-title-accent">Signal</span>
            </h1>

            <p className="landing-tagline">
              Scroll into a console that wakes up layer by layer, not a landing page
              that simply appears.
            </p>

            <p className="lede">
              Collect bug reports, feature requests, applications, and surveys. Route
              public intake into an encrypted signal inbox with Walrus-native storage
              and wallet-optional response flows.
            </p>

            <div className="cta-row">
              <Link className="primary-button" to="/admin/forms/new">
                Create form
              </Link>
              <Link className="ghost-button" to="/dashboard">
                View demo
              </Link>
            </div>

            <div className="hero-use-cases" aria-label="DeepSignal use cases">
              {heroUseCases.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>

            <div className="landing-proof-row" aria-label="DeepSignal capabilities">
              {capabilityNotes.map((note) => (
                <span key={note} className="landing-proof-chip">
                  {note}
                </span>
              ))}
            </div>

            <div className="landing-depth-readout" aria-hidden="true">
              {heroStatus.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="landing-sonar-column" aria-hidden="true">
            <div className="landing-sonar-panel">
              <div className="landing-sonar-hud">
                <span>Encrypted Signal Inbox</span>
                <span>Walrus relay online</span>
              </div>

              <div className="landing-sonar-core">
                <div className="landing-sonar-rings" />
                <div className="landing-sonar-crosshair landing-sonar-crosshair-x" />
                <div className="landing-sonar-crosshair landing-sonar-crosshair-y" />
                <div className="landing-sonar-center-dot" />
                <span className="landing-sonar-blip landing-sonar-blip-a" />
                <span className="landing-sonar-blip landing-sonar-blip-b" />
                <span className="landing-sonar-blip landing-sonar-blip-c" />
              </div>

              <div className="landing-sonar-legend">
                <div className="landing-sonar-legend-card">
                  <span>PUBLIC INTAKE</span>
                  <strong>Wallet-optional route stays open</strong>
                </div>
                <div className="landing-sonar-legend-card">
                  <span>PRIVATE RELAY</span>
                  <strong>Seal-compatible payload path available</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
