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
  const heroPreviewFeatures = [
    t("landingHeroPreviewFeature1"),
    t("landingHeroPreviewFeature2"),
    t("landingHeroPreviewFeature3"),
    t("landingHeroPreviewFeature4"),
  ];
  const heroPreviewRows = [
    { label: t("landingHeroPreviewRow1"), value: t("landingHeroPreviewRow1Value"), tone: "active" },
    { label: t("landingHeroPreviewRow2"), value: t("landingHeroPreviewRow2Value"), tone: "enabled" },
    { label: t("landingHeroPreviewRow3"), value: t("landingHeroPreviewRow3Value"), tone: "ready" },
    { label: t("landingHeroPreviewRow4"), value: t("landingHeroPreviewRow4Value"), tone: "ready" },
  ];
  const heroBackdropCards = [
    {
      title: t("landingHeroPreviewBackdrop1Title"),
      body: t("landingHeroPreviewBackdrop1Body"),
    },
    {
      title: t("landingHeroPreviewBackdrop2Title"),
      body: t("landingHeroPreviewBackdrop2Body"),
    },
    {
      title: t("landingHeroPreviewBackdrop3Title"),
      body: t("landingHeroPreviewBackdrop3Body"),
    },
  ];
  const heroSummaryBullets = [
    t("landingHeroPreviewSummaryItem1"),
    t("landingHeroPreviewSummaryItem2"),
    t("landingHeroPreviewSummaryItem3"),
  ];
  const heroSummaryBars = [0.82, 0.72, 0.45, 0.88, 0.76, 0.54];
  const heroChartBars = [0.58, 0.34, 0.41, 0.62, 0.29, 0.46, 0.22, 0.68, 0.44, 0.31, 0.52, 0.27];

  return (
    <section className="landing-shell">
      <div className="landing-page-atmosphere" aria-hidden="true" />

      <section className="landing-hero-console panel glow-panel">
        <div className="landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="eyebrow">{t("landingHeroEyebrow")}</p>

            <h1 className="landing-hero-title">
              <span>{t("landingHeroTitleLine1")}</span>
              <span className="landing-hero-title-accent">{t("landingHeroTitleLine2")}</span>
            </h1>

            <p className="landing-tagline">{t("landingHeroTagline")}</p>

            <p className="lede">{t("landingHeroBody")}</p>

            <p className="landing-hero-support">{t("landingHeroSupport")}</p>

            <div className="cta-row landing-hero-actions">
              <Link className="primary-button landing-cta-primary" to="/dashboard">
                {t("landingHeroCreate")}
              </Link>
              <Link className="ghost-button landing-cta-secondary" to="/explore">
                {t("landingHeroDemo")}
              </Link>
            </div>

            <p className="landing-hero-proofline">{t("landingHeroProofline")}</p>
          </div>

          <div className="landing-sonar-column">
            <article className="landing-hero-app-preview">
              <div className="landing-hero-backdrop-stack" aria-hidden="true">
                {heroBackdropCards.map((card, index) => (
                  <div key={card.title} className={`landing-hero-backdrop-card landing-hero-backdrop-card-${index + 1}`}>
                    <strong>{card.title}</strong>
                    <span>{card.body}</span>
                  </div>
                ))}
              </div>

              <div className="landing-hero-app-copy">
                <span className="landing-hero-form-preview-eyebrow">{t("landingHeroPreviewEyebrow")}</span>
                <h2>{t("landingHeroPreviewTitle")}</h2>
                <p>{t("landingHeroPreviewBody")}</p>
              </div>

              <div className="landing-hero-feature-row">
                {heroPreviewFeatures.map((feature) => (
                  <div key={feature} className="landing-hero-feature-pill">
                    <span className="landing-hero-feature-icon" aria-hidden="true" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <div className="landing-hero-workbench">
                <div className="landing-hero-form-builder">
                  <div className="landing-hero-question-row">
                    <span className="landing-hero-question-badge">Q1</span>
                    <strong>{t("landingHeroPreviewQuestion")}</strong>
                  </div>

                  <div className="landing-hero-answer-field">{t("landingHeroPreviewAnswerPlaceholder")}</div>

                  <div className="landing-hero-setting-list">
                    {heroPreviewRows.map((row) => (
                      <div key={row.label} className="landing-hero-setting-row">
                        <span>{row.label}</span>
                        <strong className={`landing-hero-status-pill is-${row.tone}`}>{row.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="landing-hero-summary-panel">
                  <div className="landing-hero-summary-header">
                    <strong>{t("landingHeroPreviewSummaryTitle")}</strong>
                    <span>{t("landingHeroPreviewSummaryMeta")}</span>
                  </div>

                  <div className="landing-hero-summary-copy">
                    <span>{t("landingHeroPreviewSummaryLead")}</span>
                    <ul className="landing-hero-summary-bullets">
                      {heroSummaryBullets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="landing-hero-summary-lines">
                    {heroSummaryBars.map((width, index) => (
                      <span
                        key={index}
                        className="landing-hero-summary-line"
                        style={{ "--line-width": `${width * 100}%` } as CSSProperties}
                      />
                    ))}
                  </div>

                  <div className="landing-hero-summary-chart">
                    {heroChartBars.map((height, index) => (
                      <span
                        key={index}
                        className="landing-hero-chart-bar"
                        style={{ "--bar-height": `${height * 100}%` } as CSSProperties}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <CreateFormLink className="primary-button landing-hero-form-preview-cta">
                {t("landingHeroPreviewCta")}
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
