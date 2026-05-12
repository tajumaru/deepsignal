import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const heroUseCases = ["Bug reports", "Feature requests", "Applications", "Surveys"];

const capabilityNotes = [
  "Wallet-optional responder flow",
  "Walrus-backed storage",
  "Optional private access",
];

const heroStatus = ["DEPTH 00", "SONAR LOCK", "RELAY STABLE"];

const channelSequence = [
  "Define intake",
  "Set optional privacy",
  "Deploy response route",
];

const roadmapSyncSequence = [
  "Reviewed signal",
  "Status update",
  "Roadmap relay",
  "Public sync",
];

export function LandingPage() {
  const [createVisible, setCreateVisible] = useState(false);
  const [roadmapVisible, setRoadmapVisible] = useState(false);
  const createRef = useRef<HTMLElement | null>(null);
  const roadmapRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === createRef.current) {
            setCreateVisible(entry.isIntersecting);
          }
          if (entry.target === roadmapRef.current) {
            setRoadmapVisible(entry.isIntersecting);
          }
        });
      },
      {
        threshold: 0.22,
        rootMargin: "0px 0px -12% 0px",
      },
    );

    if (createRef.current) observer.observe(createRef.current);
    if (roadmapRef.current) observer.observe(roadmapRef.current);

    return () => observer.disconnect();
  }, []);

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
                <div className="landing-sonar-sweep" />
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

      <section
        ref={createRef}
        className={`panel glow-panel landing-reveal-panel ${createVisible ? "is-visible" : ""}`}
      >
        <div className="landing-section-head">
          <p className="eyebrow">Create Signal Channel</p>
          <h2>Bring a new intake channel online after the console clears</h2>
          <p className="lede">
            Spin up a new public responder route, keep privacy optional, and route the
            resulting payloads into the encrypted inbox without breaking the local
            fallback path.
          </p>
        </div>

        <div className="landing-channel-grid">
          <section className="landing-channel-card">
            <p className="landing-mock-card-label">Boot path</p>
            {channelSequence.map((step, index) => (
              <div key={step} className="landing-channel-step">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </section>

          <section className="landing-channel-card landing-channel-focus">
            <p className="landing-mock-card-label">Console note</p>
            <strong>Create Signal Channel</strong>
            <p>
              Launch bug-report, feature-request, application, or survey flows inside
              the same encrypted signal architecture instead of dropping users into a
              generic form builder.
            </p>
            <div className="landing-channel-tags">
              <span>Public ingress</span>
              <span>Seal optional</span>
              <span>Walrus relay</span>
            </div>
          </section>
        </div>
      </section>

      <section
        ref={roadmapRef}
        className={`panel glow-panel landing-reveal-panel landing-roadmap-panel ${
          roadmapVisible ? "is-visible" : ""
        }`}
      >
        <div className="landing-section-head">
          <p className="eyebrow">Roadmap Sync Flow</p>
          <h2>Finish with reviewed signals surfacing into the public roadmap relay</h2>
          <p className="lede">
            Public visibility appears last, after intake, review, and optional privacy
            handling are already online inside the console.
          </p>
        </div>

        <div className="landing-roadmap-flow">
          {roadmapSyncSequence.map((step, index) => (
            <div key={step} className="landing-roadmap-node">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
