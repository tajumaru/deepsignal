import { useEffect, useRef, useState, type CSSProperties } from "react";
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

const encryptedFlowSteps = [
  "Ingress",
  "Seal",
  "Walrus relay",
  "Inbox sync",
];

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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function LandingPage() {
  const [activityIndex, setActivityIndex] = useState(0);
  const [isActivityVisible, setIsActivityVisible] = useState(true);
  const [heroProgress, setHeroProgress] = useState(0);
  const [createVisible, setCreateVisible] = useState(false);
  const [roadmapVisible, setRoadmapVisible] = useState(false);
  const heroRef = useRef<HTMLElement | null>(null);
  const createRef = useRef<HTMLElement | null>(null);
  const roadmapRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    const updateProgress = () => {
      const stage = heroRef.current;
      if (!stage) return;

      const rect = stage.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 1;
      const total = Math.max(rect.height - viewportHeight, 1);
      const next = clamp(-rect.top / total, 0, 1);
      setHeroProgress(next);
    };

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);

    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, []);

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

  const heroStyle = {
    "--hero-progress": heroProgress.toFixed(3),
  } as CSSProperties;
  const hasConsoleAwake = heroProgress > 0.1;

  return (
    <section className="landing-shell console-depth-shell">
      <section ref={heroRef} className="landing-depth-stage" style={heroStyle}>
        <div
          className={`landing-depth-sticky panel glow-panel ${hasConsoleAwake ? "is-console-awake" : ""}`}
        >
          <div className="landing-depth-scrim" aria-hidden="true" />
          <div className="landing-depth-grid hero-layout landing-hero">
            <div className="hero-copy landing-copy landing-depth-copy">
              <p className="eyebrow">Walrus-native signal console</p>
              <h1>DeepSignal</h1>

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
                <span>Depth {Math.round(heroProgress * 100).toString().padStart(2, "0")}</span>
                <span>SONAR LOCK</span>
                <span>RELAY STABLE</span>
              </div>
            </div>

            <div className="landing-console-panel" aria-hidden="true">
              <div className="landing-console-hud">
                <span>Signal Console Boot Sequence</span>
                <span>{Math.round(heroProgress * 100)}%</span>
              </div>

              <div className="panel glow-panel landing-mock-panel">
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

                  <div className="landing-encrypted-flow">
                    {encryptedFlowSteps.map((step) => (
                      <div key={step} className="landing-encrypted-node">
                        <span className="landing-encrypted-dot" />
                        <strong>{step}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="landing-mock-layout">
                    <div className="landing-mock-stack">
                      <section className="landing-mock-card landing-mock-form">
                        <p className="landing-mock-card-label">Signal panel / intake</p>
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
                            <p className="landing-mock-card-label">Responder route</p>
                            <strong>Wallet-optional response page</strong>
                          </div>
                          <span className="landing-mock-public-pill">Open ingress</span>
                        </div>
                        <div className="landing-mock-public-lines">
                          <span className="landing-mock-line landing-mock-line-title" />
                          <span className="landing-mock-line" />
                          <span className="landing-mock-line landing-mock-line-short" />
                        </div>
                        <div className="landing-mock-button">Submit signal</div>
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
            The reveal should feel like a new system surface floating up from below the
            active console, not a separate marketing block.
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
              Spin up a new public responder route, keep privacy optional, and route the
              resulting payloads into the encrypted inbox without breaking the local
              fallback path.
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
            Public visibility appears last, after intake, seal, and review have already
            come online inside the console depth.
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
