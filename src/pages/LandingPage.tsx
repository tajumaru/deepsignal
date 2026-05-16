import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { CreateFormLink } from "../components/CreateFormLink";
import { useI18n } from "../i18n";

function useScrollReveal() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;

    if (!node || !("IntersectionObserver" in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.24 },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return { sectionRef, isVisible };
}

function ExploreIntroSection() {
  const { sectionRef, isVisible } = useScrollReveal();
  const { t } = useI18n();
  const exploreCards = [
    { title: t("landingExploreCard1Title"), body: t("landingExploreCard1Body") },
    { title: t("landingExploreCard2Title"), body: t("landingExploreCard2Body") },
    { title: t("landingExploreCard3Title"), body: t("landingExploreCard3Body") },
  ];

  return (
    <section
      ref={sectionRef}
      className={`landing-explore-section ${isVisible ? "is-visible" : ""}`}
      aria-labelledby="landing-explore-title"
    >
      <div className="landing-explore-rail" aria-hidden="true">
        <span />
      </div>

      <div className="landing-explore-panel">
        <div className="landing-explore-header">
          <div>
            <p className="eyebrow">{t("landingExploreEyebrow")}</p>
            <h2 id="landing-explore-title">{t("landingExploreTitle")}</h2>
          </div>
          <p className="muted">{t("landingExploreBody")}</p>
        </div>

        <div className="landing-explore-card-grid">
          {exploreCards.map((card, index) => (
            <article key={card.title} className="landing-explore-card" style={{ "--reveal-index": index } as CSSProperties}>
              <span className="landing-explore-card-index">0{index + 1}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </div>

        <div className="cta-row landing-explore-actions">
          <Link className="primary-button landing-cta-primary" to="/explore">
            {t("landingExploreCtaPrimary")}
          </Link>
          <CreateFormLink className="ghost-button landing-cta-secondary">
            {t("landingExploreCtaSecondary")}
          </CreateFormLink>
        </div>
      </div>
    </section>
  );
}

function SignalFlowSection() {
  const { sectionRef, isVisible } = useScrollReveal();
  const { t } = useI18n();
  const flowSteps = [
    { label: "01", title: t("landingFlowStep1Title"), body: t("landingFlowStep1Body"), tone: "origin" },
    { label: "02", title: t("landingFlowStep2Title"), body: t("landingFlowStep2Body"), tone: "storage" },
    { label: "03", title: t("landingFlowStep3Title"), body: t("landingFlowStep3Body"), tone: "seal" },
    { label: "04", title: t("landingFlowStep4Title"), body: t("landingFlowStep4Body"), tone: "triage" },
    { label: "05", title: t("landingFlowStep5Title"), body: t("landingFlowStep5Body"), tone: "inbox" },
    { label: "06", title: t("landingFlowStep6Title"), body: t("landingFlowStep6Body"), tone: "sync" },
  ];

  return (
    <section
      ref={sectionRef}
      className={`landing-flow-section ${isVisible ? "is-visible" : ""}`}
      aria-labelledby="landing-flow-title"
    >
      <div className="landing-flow-panel">
        <div className="landing-flow-background" aria-hidden="true">
          <span className="landing-flow-orb landing-flow-orb-1" />
          <span className="landing-flow-orb landing-flow-orb-2" />
          <span className="landing-flow-orb landing-flow-orb-3" />
          <span className="landing-flow-grid" />
          <span className="landing-flow-particle landing-flow-particle-1" />
          <span className="landing-flow-particle landing-flow-particle-2" />
          <span className="landing-flow-particle landing-flow-particle-3" />
          <span className="landing-flow-particle landing-flow-particle-4" />
        </div>

        <div className="landing-flow-header">
          <div className="landing-flow-header-copy">
            <p className="eyebrow">{t("landingFlowEyebrow")}</p>
            <h2 id="landing-flow-title">{t("landingFlowTitle")}</h2>
            <p className="muted">{t("landingFlowBody")}</p>
          </div>

          <div className="landing-flow-header-actions">
            <CreateFormLink className="primary-button landing-cta-primary landing-flow-cta">
              {t("landingFlowCtaPrimary")}
            </CreateFormLink>
          </div>
        </div>

        <div className="landing-flow-track" aria-label={t("landingFlowTrackLabel")}>
          {flowSteps.map((step, index) => (
            <article
              key={step.title}
              className={`landing-flow-card landing-flow-card-${step.tone}`}
              style={{ "--reveal-index": index } as CSSProperties}
            >
              <div className="landing-flow-node">
                <span className="landing-flow-node-core" />
                <span className="landing-flow-node-ring landing-flow-node-ring-1" />
                <span className="landing-flow-node-ring landing-flow-node-ring-2" />
              </div>

              <div className="landing-flow-card-copy">
                <span className="landing-flow-step-label">{step.label}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function SignalInboxIntroSection() {
  const { sectionRef, isVisible } = useScrollReveal();
  const { t } = useI18n();
  const inboxCards = [
    { title: t("landingInboxCard1Title"), body: t("landingInboxCard1Body") },
    { title: t("landingInboxCard2Title"), body: t("landingInboxCard2Body") },
    { title: t("landingInboxCard3Title"), body: t("landingInboxCard3Body") },
  ];
  const inboxPreviewItems = [
    { label: t("landingInboxPreviewItem1"), status: t("landingInboxPreviewStatus1") },
    { label: t("landingInboxPreviewItem2"), status: t("landingInboxPreviewStatus2") },
    { label: t("landingInboxPreviewItem3"), status: t("landingInboxPreviewStatus3") },
    { label: t("landingInboxPreviewItem4"), status: t("landingInboxPreviewStatus4") },
  ];

  return (
    <section
      ref={sectionRef}
      className={`landing-inbox-section ${isVisible ? "is-visible" : ""}`}
      aria-labelledby="landing-inbox-title"
    >
      <div className="landing-inbox-panel">
        <div className="landing-inbox-copy">
          <p className="eyebrow">{t("landingInboxEyebrow")}</p>
          <h2 id="landing-inbox-title">{t("landingInboxTitle")}</h2>
          <p className="muted">{t("landingInboxBody")}</p>

          <div className="landing-inbox-card-grid">
            {inboxCards.map((card, index) => (
              <article key={card.title} className="landing-inbox-card" style={{ "--reveal-index": index } as CSSProperties}>
                <span>0{index + 1}</span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>

          <div className="cta-row landing-inbox-actions">
            <Link className="primary-button landing-cta-primary" to="/dashboard">
              {t("landingInboxCtaPrimary")}
            </Link>
            <CreateFormLink className="ghost-button landing-cta-secondary">
              {t("landingInboxCtaSecondary")}
            </CreateFormLink>
          </div>
        </div>

        <div className="landing-inbox-preview" aria-label={t("landingInboxPreviewLabel")}>
          <div className="landing-inbox-preview-topline">
            <span>{t("landingInboxPreviewTopline")}</span>
            <strong>{t("landingInboxPreviewWorkspace")}</strong>
          </div>

          <div className="landing-inbox-preview-stream">
            {inboxPreviewItems.map((item, index) => (
              <div key={item.label} className="landing-inbox-preview-row" style={{ "--reveal-index": index } as CSSProperties}>
                <span className="landing-inbox-preview-dot" />
                <div>
                  <strong>{item.label}</strong>
                  <small>{t("landingInboxPreviewMeta")}</small>
                </div>
                <span className="landing-inbox-status-pill">{item.status}</span>
              </div>
            ))}
          </div>

          <div className="landing-inbox-preview-footer">
            <span>{t("landingInboxPreviewQueue")}</span>
            <strong>{t("landingInboxPreviewCount")}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function LiveSystemStatusSection() {
  const { sectionRef, isVisible } = useScrollReveal();
  const { t } = useI18n();
  const statuses = [
    { label: t("landingStatusItem1Label"), value: t("landingStatusItem1Value"), tone: "connected" },
    { label: t("landingStatusItem2Label"), value: t("landingStatusItem2Value"), tone: "active" },
    { label: t("landingStatusItem3Label"), value: t("landingStatusItem3Value"), tone: "verified" },
    { label: t("landingStatusItem4Label"), value: t("landingStatusItem4Value"), tone: "running" },
    { label: t("landingStatusItem5Label"), value: t("landingStatusItem5Value"), tone: "monitoring" },
  ];

  return (
    <section
      ref={sectionRef}
      className={`landing-status-section ${isVisible ? "is-visible" : ""}`}
      aria-labelledby="landing-status-title"
    >
      <div className="landing-status-panel">
        <div className="landing-status-copy">
          <p className="eyebrow">{t("landingStatusEyebrow")}</p>
          <h2 id="landing-status-title">{t("landingStatusTitle")}</h2>
          <p className="muted">{t("landingStatusBody")}</p>
        </div>

        <div className="landing-status-console" role="status" aria-label={t("landingStatusConsoleLabel")}>
          <div className="landing-status-console-topline">
            <span>{t("landingStatusConsoleTitle")}</span>
            <strong>{t("landingStatusConsoleMeta")}</strong>
          </div>

          <div className="landing-status-list">
            {statuses.map((item, index) => (
              <div key={item.label} className="landing-status-row" style={{ "--reveal-index": index } as CSSProperties}>
                <span className="landing-status-label">{item.label}</span>
                <span className={`landing-status-pill is-${item.tone}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingPage() {
  const { t } = useI18n();
  const heroSignalBars = [0.46, 0.72, 0.38, 0.92, 0.58, 0.81, 0.5, 0.68, 0.42, 0.86];
  const heroFeedRows = [t("landingHeroLiveFeed1"), t("landingHeroLiveFeed2"), t("landingHeroLiveFeed3")];

  return (
    <section className="landing-shell">
      <div className="landing-page-atmosphere" aria-hidden="true" />

      <section className="landing-hero-console panel glow-panel">
        <div className="landing-hero-grid">
          <div className="landing-hero-global-traces" aria-hidden="true">
            <span className="landing-hero-global-trace landing-hero-global-trace-1" />
            <span className="landing-hero-global-trace landing-hero-global-trace-2" />
            <span className="landing-hero-global-trace landing-hero-global-trace-3" />
            <span className="landing-hero-particle landing-hero-particle-1" />
            <span className="landing-hero-particle landing-hero-particle-2" />
            <span className="landing-hero-particle landing-hero-particle-3" />
          </div>

          <div className="landing-hero-copy">
            <p className="eyebrow">{t("landingHeroSystemEyebrow")}</p>

            <h1 className="landing-hero-title">
              <span>{t("landingHeroContestTitle")}</span>
            </h1>

            <p className="landing-tagline">{t("landingHeroContestTagline")}</p>

            <div className="cta-row landing-hero-actions">
              <Link className="primary-button landing-cta-primary" to="/dashboard">
                {t("landingHeroContestCreate")}
              </Link>
              <Link className="ghost-button landing-cta-secondary" to="/explore">
                {t("landingHeroDemo")}
              </Link>
            </div>

            <p className="landing-hero-proofline">{t("landingHeroContestProofline")}</p>
          </div>

          <div className="landing-sonar-column">
            <article className="landing-hero-app-preview">
              <div className="landing-hero-orbit-field" aria-hidden="true">
                <span className="landing-hero-orbit landing-hero-orbit-1" />
                <span className="landing-hero-orbit landing-hero-orbit-2" />
                <span className="landing-hero-orbit landing-hero-orbit-3" />
              </div>

              <div className="landing-hero-system-topline">
                <span className="landing-hero-form-preview-eyebrow">{t("landingHeroSystemEyebrow")}</span>
                <span className="landing-hero-system-status">
                  <span aria-hidden="true" />
                  {t("landingHeroSystemStatus")}
                </span>
              </div>

              <div className="landing-hero-system-links" aria-hidden="true">
                <span className="landing-hero-link landing-hero-link-core-routing" />
                <span className="landing-hero-link landing-hero-link-routing-seal" />
                <span className="landing-hero-link landing-hero-link-seal-live" />
                <span className="landing-hero-link landing-hero-link-live-walrus" />
                <span className="landing-hero-link landing-hero-link-core-anon" />
              </div>

              <div className="landing-hero-intel-grid">
                <section className="landing-hero-module landing-hero-core" aria-label={t("landingHeroCoreTitle")}>
                  <div className="landing-hero-core-header">
                    <span>{t("landingHeroCoreKicker")}</span>
                    <strong>{t("landingHeroCoreMetric")}</strong>
                  </div>
                  <div className="landing-hero-core-visual" aria-hidden="true">
                    <span className="landing-hero-core-ring landing-hero-core-ring-1" />
                    <span className="landing-hero-core-ring landing-hero-core-ring-2" />
                    <span className="landing-hero-core-node" />
                    <span className="landing-hero-core-scan" />
                    <span className="landing-hero-core-route landing-hero-core-route-1" />
                    <span className="landing-hero-core-route landing-hero-core-route-2" />
                  </div>
                  <div className="landing-hero-core-copy">
                    <h2>{t("landingHeroCoreTitle")}</h2>
                    <p>{t("landingHeroCoreBody")}</p>
                  </div>
                  <div className="landing-hero-create-preview" aria-hidden="true">
                    <div className="landing-hero-create-input">
                      <span>{t("landingHeroCreateInputLabel")}</span>
                      <strong>{t("landingHeroCreateInputValue")}</strong>
                    </div>
                    <div className="landing-hero-create-pipeline">
                      <span>{t("landingHeroCreatePipeline1")}</span>
                      <span>{t("landingHeroCreatePipeline2")}</span>
                      <span>{t("landingHeroCreatePipeline3")}</span>
                    </div>
                  </div>
                  <div className="landing-hero-core-bars" aria-hidden="true">
                    {heroSignalBars.map((height, index) => (
                      <span
                        key={index}
                        style={{ "--bar-height": `${height * 100}%`, "--bar-index": index } as CSSProperties}
                      />
                    ))}
                  </div>
                </section>

                <section className="landing-hero-module landing-hero-routing" aria-label={t("landingHeroRoutingTitle")}>
                  <div className="landing-hero-module-title">
                    <span>{t("landingHeroRoutingTitle")}</span>
                    <strong>{t("landingHeroRoutingMetric")}</strong>
                  </div>
                  <div className="landing-hero-routing-lines" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <i />
                    <i />
                    <i />
                  </div>
                </section>

                <section className="landing-hero-module landing-hero-seal" aria-label={t("landingHeroSealTitle")}>
                  <div className="landing-hero-lock" aria-hidden="true">
                    <span />
                  </div>
                  <div className="landing-hero-module-title">
                    <span>{t("landingHeroSealTitle")}</span>
                    <strong>{t("landingHeroSealMetric")}</strong>
                  </div>
                </section>

                <section className="landing-hero-module landing-hero-walrus" aria-label={t("landingHeroWalrusTitle")}>
                  <div className="landing-hero-module-title">
                    <span>{t("landingHeroWalrusTitle")}</span>
                    <strong>{t("landingHeroWalrusMetric")}</strong>
                  </div>
                  <div className="landing-hero-hash-stack" aria-hidden="true">
                    <span>0x7a91</span>
                    <span>blob synced</span>
                  </div>
                </section>

                <section className="landing-hero-module landing-hero-anon" aria-label={t("landingHeroAnonymousTitle")}>
                  <div className="landing-hero-mask" aria-hidden="true">
                    <span />
                    <span />
                  </div>
                  <div className="landing-hero-module-title">
                    <span>{t("landingHeroAnonymousTitle")}</span>
                    <strong>{t("landingHeroAnonymousMetric")}</strong>
                  </div>
                </section>

                <section className="landing-hero-module landing-hero-live" aria-label={t("landingHeroLiveTitle")}>
                  <div className="landing-hero-module-title">
                    <span>{t("landingHeroLiveTitle")}</span>
                    <strong>{t("landingHeroLiveMetric")}</strong>
                  </div>
                  <div className="landing-hero-live-feed">
                    {heroFeedRows.map((row) => (
                      <span key={row}>{row}</span>
                    ))}
                  </div>
                </section>
              </div>

              <CreateFormLink className="primary-button landing-hero-form-preview-cta">
                {t("landingHeroContestCreate")}
              </CreateFormLink>

              <p className="landing-hero-powered-by">{t("landingHeroPreviewPoweredBy")}</p>
            </article>
          </div>
        </div>
      </section>

      <SignalFlowSection />
      <ExploreIntroSection />
      <SignalInboxIntroSection />
      <LiveSystemStatusSection />
    </section>
  );
}
