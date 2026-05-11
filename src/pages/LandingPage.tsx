import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const capabilityNotes = [
  "Wallet-optional responder flow",
  "Walrus-backed storage",
  "Optional private access",
];

const activityItems = [
  "New bug report received",
  "Review synced",
  "Private submission stored",
  "Priority updated",
];

const heroUseCases = [
  "Bug reports",
  "Feature requests",
  "Applications",
  "Surveys",
];

export function LandingPage() {
  const [activityIndex, setActivityIndex] = useState(0);
  const [isActivityVisible, setIsActivityVisible] = useState(true);

  useEffect(() => {
    let timeoutId: number | undefined;

    const intervalId = window.setInterval(() => {
      setIsActivityVisible(false);

      timeoutId = window.setTimeout(() => {
        setActivityIndex((current) => (current + 1) % activityItems.length);
        setIsActivityVisible(true);
      }, 220);
    }, 3200);

    return () => {
      window.clearInterval(intervalId);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return (
    <section className="landing-shell">
      <div className="hero-layout landing-hero">
        <div className="hero-copy panel glow-panel landing-copy">
          <p className="eyebrow">Walrus-native feedback forms</p>
          <h1>DeepSignal</h1>

          <p className="landing-tagline">
            Walrus-native feedback forms for teams and communities.
          </p>

          <p className="lede">
            Collect bug reports, feature requests, applications, and surveys. Store
            submissions on Walrus with optional private access.
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
        </div>

        <div className="panel glow-panel landing-mock-panel" aria-hidden="true">
          <div className="landing-mock">
            <div className="landing-mock-header">
              <div>
                <p className="landing-mock-label">Public form</p>
                <strong>Product feedback intake</strong>
              </div>
              <span className="landing-mock-badge">Live on Walrus</span>
            </div>

            <div className="landing-mock-status-row">
              <span>Accepting responses</span>
              <span>24 submissions</span>
              <span>Private review enabled</span>
            </div>

            <div className="landing-mock-layout">
              <div className="landing-mock-stack">
                <section className="landing-mock-card landing-mock-form">
                  <p className="landing-mock-card-label">Form builder</p>
                  <div className="landing-mock-field">
                    <span>Category</span>
                    <strong>Bug report</strong>
                  </div>
                  <div className="landing-mock-field">
                    <span>Summary</span>
                    <strong>Wallet connect fails on mobile</strong>
                  </div>
                  <div className="landing-mock-field">
                    <span>Attachment</span>
                    <strong>Screenshot.png</strong>
                  </div>
                </section>

                <section className="landing-mock-card landing-mock-public">
                  <div className="landing-mock-public-head">
                    <div>
                      <p className="landing-mock-card-label">Public form</p>
                      <strong>Shareable response page</strong>
                    </div>
                    <span className="landing-mock-public-pill">Wallet optional</span>
                  </div>
                  <div className="landing-mock-public-lines">
                    <span className="landing-mock-line landing-mock-line-title" />
                    <span className="landing-mock-line" />
                    <span className="landing-mock-line landing-mock-line-short" />
                  </div>
                  <div className="landing-mock-button">Submit response</div>
                </section>
              </div>

              <section className="landing-mock-card landing-mock-inbox">
                <div className="landing-mock-inbox-head">
                  <div>
                    <p className="landing-mock-card-label">Encrypted signal inbox</p>
                    <strong>Recent submissions</strong>
                  </div>
                  <div className="landing-mock-inbox-status">
                    <span className="landing-sync-dot" />
                    <span>Synced</span>
                    <span className="landing-mock-count">24</span>
                  </div>
                </div>

                <div
                  className={`landing-activity-line ${isActivityVisible ? "is-visible" : ""}`}
                  aria-live="polite"
                >
                  <span className="landing-activity-marker">+</span>
                  <span>{activityItems[activityIndex]}</span>
                </div>

                <div className="landing-mock-thread is-active">
                  <strong>Bug report</strong>
                  <span>Wallet connect fails on mobile</span>
                </div>
                <div className="landing-mock-thread">
                  <strong>Feature request</strong>
                  <span>Add upvote field to roadmap form</span>
                </div>
                <div className="landing-mock-thread">
                  <strong>Survey response</strong>
                  <span>Users prefer shorter intake forms</span>
                </div>

                <div className="landing-mock-meta">
                  <span>Stored on Walrus</span>
                  <span>Private access optional</span>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
