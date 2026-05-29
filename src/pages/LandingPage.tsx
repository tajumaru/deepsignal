import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { CreateFormLink } from "../components/CreateFormLink";
import { FlowStepIcon, type FlowStepIconName } from "../components/SignalFlowIcons";
import { useI18n } from "../i18n";
import "../styles/pages/landing.css";
import "../styles/frog-effects.css";
import "../styles/mobile/layout.css";
import "../styles/mobile/landing.css";
import "../styles/mobile/landing-hero.css";
import "../styles/mobile/landing-live.css";

function UseCaseIcon({ kind }: { kind: "company" | "dao" | "hackathon" | "research" | "incident" }) {
  switch (kind) {
    case "company":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5.5 20V7.6L12 4.5l6.5 3.1V20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9 20v-4h6v4M9 10.3h.01M12 10.3h.01M15 10.3h.01M9 13.2h.01M12 13.2h.01M15 13.2h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "dao":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="2.9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 4.8v2.7M12 16.5v2.7M4.8 12h2.7M16.5 12h2.7M7 7l1.95 1.95M15.05 15.05 17 17M17 7l-1.95 1.95M8.95 15.05 7 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "hackathon":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 3.8 2.4 5 5.5.8-4 3.9.95 5.5L12 16.4 7.15 19l.95-5.5-4-3.9 5.5-.8Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case "research":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6.2 5.5h10.1A1.7 1.7 0 0 1 18 7.2v11.3H7.9a1.7 1.7 0 0 0-1.7 1.7V5.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M6.2 5.5H5.3a1.8 1.8 0 0 0-1.8 1.8v11.2h4.4M9.3 10h5.2M9.3 13.2h5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "incident":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4.5 3.9 18.8h16.2L12 4.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M12 9.3v4.7M12 17.1h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
  }
}

function SignalInfrastructureVisualization() {
  return (
    <div className="landing-live-flow-visual" aria-hidden="true">
      <div className="landing-live-flow-visual-grid" />
      <div className="landing-live-flow-visual-radar">
        <span className="landing-live-flow-visual-radar-ring landing-live-flow-visual-radar-ring-1" />
        <span className="landing-live-flow-visual-radar-ring landing-live-flow-visual-radar-ring-2" />
        <span className="landing-live-flow-visual-radar-ring landing-live-flow-visual-radar-ring-3" />
        <span className="landing-live-flow-visual-sweep" />
        <span className="landing-live-flow-visual-core" />
      </div>
      <svg className="landing-live-flow-visual-network" viewBox="0 0 320 220" role="presentation" focusable="false">
        <path className="landing-live-flow-visual-path landing-live-flow-visual-path-seal" d="M54 144C92 124 112 112 148 103C184 94 214 92 260 80" />
        <path className="landing-live-flow-visual-path landing-live-flow-visual-path-review" d="M55 144C104 154 136 162 176 172C208 180 233 179 271 160" />
        <path className="landing-live-flow-visual-path landing-live-flow-visual-path-audit" d="M161 64C170 96 176 127 182 168" />
        <circle className="landing-live-flow-visual-node is-entry" cx="54" cy="144" r="8" />
        <circle className="landing-live-flow-visual-node is-seal" cx="160" cy="64" r="10" />
        <circle className="landing-live-flow-visual-node is-walrus" cx="266" cy="80" r="11" />
        <circle className="landing-live-flow-visual-node is-review" cx="272" cy="160" r="9" />
        <circle className="landing-live-flow-visual-node is-audit" cx="182" cy="170" r="9" />
      </svg>
      <div className="landing-live-flow-visual-packet landing-live-flow-visual-packet-1" />
      <div className="landing-live-flow-visual-packet landing-live-flow-visual-packet-2" />
      <div className="landing-live-flow-visual-packet landing-live-flow-visual-packet-3" />
      <div className="landing-live-flow-visual-label landing-live-flow-visual-label-entry">Ingress</div>
      <div className="landing-live-flow-visual-label landing-live-flow-visual-label-seal">Seal</div>
      <div className="landing-live-flow-visual-label landing-live-flow-visual-label-walrus">Walrus</div>
      <div className="landing-live-flow-visual-label landing-live-flow-visual-label-review">Review</div>
      <div className="landing-live-flow-visual-label landing-live-flow-visual-label-audit">Audit</div>
    </div>
  );
}

function useScrollReveal() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;

    if (!node || !("IntersectionObserver" in window)) {
      setIsVisible(true);
      return;
    }

    const revealNowIfNearViewport = () => {
      const rect = node.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      if (rect.top <= viewportHeight * 0.92) {
        setIsVisible(true);
        return true;
      }
      return false;
    };

    if (revealNowIfNearViewport()) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting || entry.intersectionRatio > 0) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "0px 0px 8% 0px",
        threshold: [0, 0.08, 0.16],
      },
    );

    observer.observe(node);

    const handleScroll = () => {
      if (revealNowIfNearViewport()) {
        observer.disconnect();
        window.removeEventListener("scroll", handleScroll);
        window.removeEventListener("resize", handleScroll);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  return { sectionRef, isVisible };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

function UseCasesSection() {
  const { sectionRef, isVisible } = useScrollReveal();
  const { t } = useI18n();
  type UseCaseFlowStep = FlowStepIconName;
  const flowSteps = [
    { iconName: "Submit" as UseCaseFlowStep, label: t("landingUseCasesFlowSubmit") },
    { iconName: "Encrypt" as UseCaseFlowStep, label: t("landingUseCasesFlowEncrypt") },
    { iconName: "Store" as UseCaseFlowStep, label: t("landingUseCasesFlowStore") },
    { iconName: "Review" as UseCaseFlowStep, label: t("landingUseCasesFlowReview") },
  ];
  const trustSignals = [
    {
      key: "encrypted",
      title: t("landingUseCasesTrustEncryptedTitle"),
      body: t("landingUseCasesTrustEncryptedBody"),
    },
    {
      key: "immutable",
      title: t("landingUseCasesTrustImmutableTitle"),
      body: t("landingUseCasesTrustImmutableBody"),
    },
    {
      key: "wallet",
      title: t("landingUseCasesTrustWalletTitle"),
      body: t("landingUseCasesTrustWalletBody"),
    },
    {
      key: "ai",
      title: t("landingUseCasesTrustAiTitle"),
      body: t("landingUseCasesTrustAiBody"),
    },
    {
      key: "audit",
      title: t("landingUseCasesTrustAuditTitle"),
      body: t("landingUseCasesTrustAuditBody"),
    },
  ] as const;
  const useCases = [
    {
      title: t("landingUseCasesCompanyTitle"),
      body: t("landingUseCasesCompanyBody"),
      badge: t("landingUseCasesCompanyBadge"),
      tone: "feedback",
      icon: "company" as const,
      chips: [t("landingUseCasesCompanyChip1"), t("landingUseCasesCompanyChip2")],
      metricLabel: t("landingUseCasesCompanyMetricLabel"),
      metricValue: t("landingUseCasesCompanyMetricValue"),
      flowSteps,
      mockType: "company" as const,
    },
    {
      title: t("landingUseCasesDaoTitle"),
      body: t("landingUseCasesDaoBody"),
      badge: t("landingUseCasesDaoBadge"),
      tone: "applications",
      icon: "dao" as const,
      chips: [t("landingUseCasesDaoChip1"), t("landingUseCasesDaoChip2")],
      metricLabel: t("landingUseCasesDaoMetricLabel"),
      metricValue: t("landingUseCasesDaoMetricValue"),
      flowSteps,
      mockType: "dao" as const,
    },
    {
      title: t("landingUseCasesHackathonTitle"),
      body: t("landingUseCasesHackathonBody"),
      badge: t("landingUseCasesHackathonBadge"),
      tone: "intelligence",
      icon: "hackathon" as const,
      chips: [t("landingUseCasesHackathonChip1"), t("landingUseCasesHackathonChip2")],
      metricLabel: t("landingUseCasesHackathonMetricLabel"),
      metricValue: t("landingUseCasesHackathonMetricValue"),
      flowSteps,
      mockType: "hackathon" as const,
    },
    {
      title: t("landingUseCasesResearchTitle"),
      body: t("landingUseCasesResearchBody"),
      badge: t("landingUseCasesResearchBadge"),
      tone: "ai",
      icon: "research" as const,
      chips: [t("landingUseCasesResearchChip1"), t("landingUseCasesResearchChip2")],
      metricLabel: t("landingUseCasesResearchMetricLabel"),
      metricValue: t("landingUseCasesResearchMetricValue"),
      flowSteps,
      mockType: "research" as const,
    },
    {
      title: t("landingUseCasesIncidentTitle"),
      body: t("landingUseCasesIncidentBody"),
      badge: t("landingUseCasesIncidentBadge"),
      tone: "incident",
      icon: "incident" as const,
      chips: [t("landingUseCasesIncidentChip1"), t("landingUseCasesIncidentChip2")],
      metricLabel: t("landingUseCasesIncidentMetricLabel"),
      metricValue: t("landingUseCasesIncidentMetricValue"),
      flowSteps,
      mockType: "incident" as const,
    },
  ];

  return (
    <section
      ref={sectionRef}
      className={`landing-use-cases-section ${isVisible ? "is-visible" : ""}`}
      aria-labelledby="landing-use-cases-title"
    >
      <div className="landing-signal-section-shell landing-use-cases-shell">
        <div className="landing-section-kicker">
          <span />
          <p className="eyebrow">{t("landingUseCasesShowcaseEyebrow")}</p>
        </div>
        <div className="landing-use-cases-hero">
          <div className="landing-use-cases-header">
            <h2 id="landing-use-cases-title">{t("landingUseCasesShowcaseTitle")}</h2>
            <p>{t("landingUseCasesShowcaseBody")}</p>
          </div>
          <div className="landing-use-cases-visual" aria-hidden="true">
            <div className="landing-use-cases-visual-orbit landing-use-cases-visual-orbit-1" />
            <div className="landing-use-cases-visual-orbit landing-use-cases-visual-orbit-2" />
            <div className="landing-use-cases-visual-node landing-use-cases-visual-node-lock" />
            <div className="landing-use-cases-visual-node landing-use-cases-visual-node-shield" />
            <div className="landing-use-cases-visual-pillar">
              <strong>WALRUS</strong>
              <span />
              <span />
            </div>
            <div className="landing-use-cases-visual-core">
              <span />
            </div>
          </div>
        </div>
        <div className="landing-use-cases-trust-strip" aria-label={t("landingUseCasesShowcaseEyebrow")}>
          {trustSignals.map((item) => (
            <div key={item.key} className="landing-use-cases-trust-pill">
              <span className={`landing-use-cases-trust-icon is-${item.key}`} aria-hidden="true" />
              <div>
                <strong>{item.title}</strong>
                <small>{item.body}</small>
              </div>
            </div>
          ))}
        </div>

        <div className="landing-use-case-field">
          {useCases.map((useCase, index) => (
            <article
              key={useCase.title}
              className={`landing-use-case landing-use-case-${useCase.tone}${useCase.mockType === "hackathon" ? " is-featured" : ""}`}
              style={{ "--reveal-index": index } as CSSProperties}
            >
              <div className={`landing-use-case-mock landing-use-case-mock-${useCase.mockType}`} aria-hidden="true">
                {useCase.mockType === "company" ? (
                  <>
                    <div className="landing-use-case-company-shell">
                      <div className="landing-use-case-company-sidebar">
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="landing-use-case-company-main">
                        <div className="landing-use-case-windowbar">
                          <span />
                          <span />
                          <span />
                        </div>
                        <div className="landing-use-case-form-title">{t("landingUseCasesCompanyMockTitle")}</div>
                        <div className="landing-use-case-company-lines">
                          <span />
                          <span />
                          <span />
                        </div>
                        <div className="landing-use-case-form-field">
                          <strong>{t("landingUseCasesCompanyMockLead")}</strong>
                          <span>{t("landingUseCasesCompanyMockBody")}</span>
                        </div>
                      </div>
                    </div>
                    <span className="landing-use-case-form-lock" />
                  </>
                ) : null}

                {useCase.mockType === "dao" ? (
                  <>
                    <div className="landing-use-case-governance-topline">
                      <strong>{t("landingUseCasesDaoMockTitle")}</strong>
                      <span>{t("landingUseCasesDaoMockSubtitle")}</span>
                    </div>
                    <div className="landing-use-case-dao-grid">
                      <div className="landing-use-case-dao-ring">
                        <div className="landing-use-case-dao-ring-core">
                          <strong>62%</strong>
                          <span>{t("landingUseCasesDaoMockYes")}</span>
                        </div>
                      </div>
                      <div className="landing-use-case-dao-metrics">
                        <span>38%</span>
                        <span>{t("landingUseCasesDaoMockNo")}</span>
                      </div>
                    </div>
                    <div className="landing-use-case-dao-detail-card">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="landing-use-case-dao-badge" />
                  </>
                ) : null}

                {useCase.mockType === "hackathon" ? (
                  <>
                    <div className="landing-use-case-review-topline">
                      <strong>{t("landingUseCasesHackathonMockTitle")}</strong>
                    </div>
                    <div className="landing-use-case-review-grid">
                      <div className="landing-use-case-review-summary">
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="landing-use-case-review-radar">
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="landing-use-case-review-score">
                        <strong>{useCase.metricValue}</strong>
                        <div className="landing-use-case-review-score-meta">
                          <small>{useCase.metricLabel}</small>
                          <span aria-label={t("landingUseCasesHackathonMockStarsLabel")}>★★★★★</span>
                        </div>
                      </div>
                    </div>
                    <div className="landing-use-case-review-comments">
                      <span />
                    </div>
                    <div className="landing-use-case-review-bot" />
                  </>
                ) : null}

                {useCase.mockType === "research" ? (
                  <>
                    <div className="landing-use-case-paper-topline">
                      <strong>{t("landingUseCasesResearchMockTitle")}</strong>
                      <span>{useCase.metricLabel}</span>
                    </div>
                    <div className="landing-use-case-paper-lines">
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="landing-use-case-paper-comment">
                      <strong>{useCase.metricValue}</strong>
                      <span>{t("landingUseCasesResearchMockComment")}</span>
                    </div>
                  </>
                ) : null}

                {useCase.mockType === "incident" ? (
                  <>
                    <div className="landing-use-case-incident-map-lines">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="landing-use-case-radar">
                      <span className="landing-use-case-radar-ring landing-use-case-radar-ring-1" />
                      <span className="landing-use-case-radar-ring landing-use-case-radar-ring-2" />
                      <span className="landing-use-case-radar-ring landing-use-case-radar-ring-3" />
                      <span className="landing-use-case-radar-sweep" />
                      <span className="landing-use-case-radar-point landing-use-case-radar-point-1" />
                      <span className="landing-use-case-radar-point landing-use-case-radar-point-2" />
                      <span className="landing-use-case-radar-point landing-use-case-radar-point-3" />
                    </div>
                    <div className="landing-use-case-incident-card">
                      <strong>{t("landingUseCasesIncidentMockTitle")}</strong>
                      <span>{t("landingUseCasesIncidentMockSubtitle")}</span>
                      <small>{useCase.metricLabel}: {useCase.metricValue}</small>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="landing-use-case-topline">
                <span className="landing-use-case-icon">
                  <UseCaseIcon kind={useCase.icon} />
                </span>
                <span className="landing-use-case-trust-badge">{useCase.badge}</span>
              </div>
              <div className="landing-use-case-copy">
                <h3>{useCase.title}</h3>
                <p>{useCase.body}</p>
                <div className="landing-use-case-chip-row">
                  {useCase.chips.map((chip) => (
                    <span key={chip} className="landing-use-case-chip">
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
              <div className="landing-use-case-flow" aria-hidden="true">
                {useCase.flowSteps.map((step) => (
                  <span key={`${useCase.title}-${step.iconName}`} className="landing-use-case-flow-step">
                    <i>
                      <FlowStepIcon name={step.iconName} />
                    </i>
                    <span className="landing-use-case-flow-label">{step.label}</span>
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
        <p className="landing-use-cases-powered-by">{t("landingUseCasesPoweredBy")}</p>
      </div>
    </section>
  );
}

function CorePrinciplesSection() {
  const { sectionRef, isVisible } = useScrollReveal();
  const { t } = useI18n();
  const principles = [
    { title: t("landingPrinciplePrivateTitle"), body: t("landingPrinciplePrivateBody"), tone: "private" },
    { title: t("landingPrincipleEncryptedTitle"), body: t("landingPrincipleEncryptedBody"), tone: "encrypted" },
    { title: t("landingPrinciplePermanentTitle"), body: t("landingPrinciplePermanentBody"), tone: "permanent" },
  ];

  return (
    <section
      ref={sectionRef}
      className={`landing-principles-section ${isVisible ? "is-visible" : ""}`}
      aria-label={t("landingPrinciplesLabel")}
    >
      <div className="landing-signal-section-shell landing-principles-shell">
        {principles.map((principle, index) => (
          <article
            key={principle.title}
            className={`landing-principle landing-principle-${principle.tone}`}
            style={{ "--reveal-index": index } as CSSProperties}
          >
            <h2>{principle.title}</h2>
            <p>{principle.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function LiveSignalFlowSection() {
  const { sectionRef, isVisible } = useScrollReveal();
  const { t } = useI18n();
  const runtimeRows = [
    {
      title: t("landingLiveFlowStep1"),
      body: t("landingLiveFlowRuntimeBody1"),
      time: "14:32:21",
      status: t("landingLiveFlowRuntimeStatus1"),
      icon: "Submit" as FlowStepIconName,
    },
    {
      title: t("landingLiveFlowStep2"),
      body: t("landingLiveFlowRuntimeBody2"),
      time: "14:32:22",
      status: t("landingLiveFlowRuntimeStatus2"),
      icon: "Review" as FlowStepIconName,
    },
    {
      title: t("landingLiveFlowStep3"),
      body: t("landingLiveFlowRuntimeBody3"),
      time: "14:32:23",
      status: t("landingLiveFlowRuntimeStatus3"),
      icon: "Encrypt" as FlowStepIconName,
      tone: "seal",
      priority: "highlight",
    },
    {
      title: t("landingLiveFlowStep4"),
      body: t("landingLiveFlowRuntimeBody4"),
      time: "14:32:25",
      status: t("landingLiveFlowRuntimeStatus4"),
      icon: "Store" as FlowStepIconName,
      tone: "walrus",
      priority: "primary",
      badge: "Certified",
    },
    {
      title: t("landingLiveFlowStep5"),
      body: t("landingLiveFlowRuntimeBody5"),
      time: "14:32:27",
      status: t("landingLiveFlowRuntimeStatus5"),
      icon: "Review" as FlowStepIconName,
    },
    {
      title: t("landingLiveFlowStep6"),
      body: t("landingLiveFlowRuntimeBody6"),
      time: "14:32:28",
      status: t("landingLiveFlowRuntimeStatus6"),
      icon: "Certify" as FlowStepIconName,
      tone: "audit",
      priority: "highlight",
    },
  ];
  const runtimeMetrics = [
    { label: t("landingLiveFlowMetric1Label"), value: t("landingLiveFlowMetric1Value"), meta: t("landingLiveFlowMetric1Meta") },
    { label: t("landingLiveFlowMetric2Label"), value: t("landingLiveFlowMetric2Value"), meta: t("landingLiveFlowMetric2Meta") },
    { label: t("landingLiveFlowMetric3Label"), value: t("landingLiveFlowMetric3Value"), meta: t("landingLiveFlowMetric3Meta") },
    { label: t("landingLiveFlowMetric4Label"), value: t("landingLiveFlowMetric4Value"), meta: t("landingLiveFlowMetric4Meta") },
  ];
  const trustPills = [
    t("landingLiveFlowTrust1"),
    t("landingLiveFlowTrust2"),
    t("landingLiveFlowTrust3"),
    t("landingLiveFlowTrust4"),
  ];
  const pipelineSteps = [
    {
      title: t("landingLiveFlowPipeline1Title"),
      body: t("landingLiveFlowPipeline1Body"),
      chip: t("landingLiveFlowPipeline1Chip"),
      icon: "Submit" as FlowStepIconName,
    },
    {
      title: t("landingLiveFlowPipeline2Title"),
      body: t("landingLiveFlowPipeline2Body"),
      chip: t("landingLiveFlowPipeline2Chip"),
      icon: "Encrypt" as FlowStepIconName,
    },
    {
      title: t("landingLiveFlowPipeline3Title"),
      body: t("landingLiveFlowPipeline3Body"),
      chip: t("landingLiveFlowPipeline3Chip"),
      icon: "Store" as FlowStepIconName,
    },
    {
      title: t("landingLiveFlowPipeline4Title"),
      body: t("landingLiveFlowPipeline4Body"),
      chip: t("landingLiveFlowPipeline4Chip"),
      icon: "Review" as FlowStepIconName,
    },
    {
      title: t("landingLiveFlowPipeline5Title"),
      body: t("landingLiveFlowPipeline5Body"),
      chip: t("landingLiveFlowPipeline5Chip"),
      icon: "Certify" as FlowStepIconName,
    },
  ];

  return (
    <section
      ref={sectionRef}
      className={`landing-live-flow-section ${isVisible ? "is-visible" : ""}`}
      aria-labelledby="landing-live-flow-title"
    >
      <div className="landing-signal-section-shell landing-live-flow-shell">
        <div className="landing-live-flow-upper">
          <div className="landing-live-flow-copy">
            <p className="eyebrow">{t("landingLiveFlowEyebrow")}</p>
            <h2 id="landing-live-flow-title">{t("landingLiveFlowTitle")}</h2>
            <p className="landing-live-flow-body">{t("landingLiveFlowBody")}</p>
            <div className="landing-live-flow-trust">
              {trustPills.map((item) => (
                <span key={item} className="landing-live-flow-trust-pill">{item}</span>
              ))}
            </div>
            <SignalInfrastructureVisualization />
            <div className="landing-live-flow-metrics">
              {runtimeMetrics.map((metric) => (
                <div key={metric.label} className="landing-live-flow-metric-card">
                  <small>{metric.label}</small>
                  <strong>{metric.value}</strong>
                  <span>{metric.meta}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="landing-live-terminal" role="status" aria-label={t("landingLiveFlowTitle")}>
            <div className="landing-live-terminal-scanline" aria-hidden="true" />
            <div className="landing-live-terminal-topline">
              <div>
                <span>{t("landingLiveFlowConsole")}</span>
                <small>{t("landingLiveFlowRuntimeSince")}</small>
              </div>
              <strong>{t("landingLiveFlowStatus")}</strong>
            </div>
            <div className="landing-live-flow-rail" aria-hidden="true">
              <span />
            </div>
            <div className="landing-live-log">
              {runtimeRows.map((row, index) => (
                <div
                  key={`${row.title}-${row.time}`}
                  className={`landing-live-log-row ${"priority" in row && row.priority ? `is-${row.priority}` : ""} ${
                    "tone" in row && row.tone ? `is-${row.tone}` : ""
                  }`}
                  style={{ "--reveal-index": index } as CSSProperties}
                >
                  <span className="landing-live-log-dot" />
                  <span className="landing-live-log-icon">
                    <FlowStepIcon name={row.icon} />
                  </span>
                  <span className="landing-live-log-timestamp">{row.time}</span>
                  <div className="landing-live-log-copy">
                    <strong>{row.title}</strong>
                    <span>{row.body}</span>
                  </div>
                  <div className="landing-live-log-meta">
                    <span>{row.status}</span>
                    {"badge" in row && row.badge ? <em className="landing-live-log-badge">{row.badge}</em> : null}
                  </div>
                  <span className="landing-live-log-check" aria-hidden="true" />
                </div>
              ))}
            </div>
            <div className="landing-live-terminal-footer">
              <span>{t("landingLiveFlowFooter")}</span>
              <a href="#landing-live-flow-title">{t("landingLiveFlowFooterLink")}</a>
            </div>
          </div>
        </div>

        <div className="landing-live-flow-lower">
          <div className="landing-live-flow-pipeline">
            <div className="landing-live-flow-pipeline-topline">{t("landingLiveFlowPipelineTitle")}</div>
            <div className="landing-live-flow-pipeline-track">
              {pipelineSteps.map((step, index) => (
                <div key={step.title} className="landing-live-flow-pipeline-step">
                  <span className="landing-live-flow-pipeline-icon">
                    <FlowStepIcon name={step.icon} />
                  </span>
                  {index < pipelineSteps.length - 1 ? <i className="landing-live-flow-pipeline-link" aria-hidden="true" /> : null}
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                  <span className="landing-live-flow-pipeline-chip">{step.chip}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="landing-live-flow-powered">
            <div className="landing-live-flow-powered-topline">{t("landingLiveFlowPoweredBy")}</div>
            <div className="landing-live-flow-powered-item">
              <span className="landing-live-flow-powered-icon is-walrus">W</span>
              <div>
                <strong>Walrus</strong>
                <p>{t("landingLiveFlowPoweredWalrus")}</p>
              </div>
            </div>
            <div className="landing-live-flow-powered-item">
              <span className="landing-live-flow-powered-icon is-seal">S</span>
              <div>
                <strong>Seal</strong>
                <p>{t("landingLiveFlowPoweredSeal")}</p>
              </div>
            </div>
            <button type="button" className="landing-live-flow-powered-button">
              {t("landingLiveFlowPoweredCta")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalSignalCtaSection() {
  const { sectionRef, isVisible } = useScrollReveal();
  const { t } = useI18n();

  return (
    <section
      ref={sectionRef}
      className={`landing-final-cta-section ${isVisible ? "is-visible" : ""}`}
      aria-labelledby="landing-final-cta-title"
    >
      <div className="landing-signal-section-shell landing-final-cta-shell">
        <span className="landing-final-cta-orbit" aria-hidden="true" />
        <p className="eyebrow">{t("landingFinalCtaEyebrow")}</p>
        <h2 id="landing-final-cta-title">{t("landingFinalCtaTitle")}</h2>
        <CreateFormLink className="primary-button landing-cta-primary landing-final-cta-button">
          {t("landingHeroContestCreate")}
        </CreateFormLink>
      </div>
    </section>
  );
}

export function LandingPage() {
  const { t } = useI18n();
  const heroSignalBars = [0.46, 0.72, 0.38, 0.92, 0.58, 0.81, 0.5, 0.68, 0.42, 0.86];
  const heroFeedRows = [t("landingHeroLiveFeed1"), t("landingHeroLiveFeed2"), t("landingHeroLiveFeed3")];
  const heroLifecycle = ["Intent", "Signal opened", "Protected", "Stored", "Reviewed", "Resolved"];
  const heroTrustBadges = ["Encrypted", "Private", "Review-ready"];
  const heroDescription =
    "DeepSignal turns feedback, reports, and forms into an encrypted inbox that feels fast to open and easy to review.";

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

            <p className="landing-hero-subcopy">{heroDescription}</p>

            <div className="landing-hero-trust-badges" aria-label="Trust badges">
              {heroTrustBadges.map((badge) => (
                <span key={badge} className="landing-hero-trust-badge">
                  {badge}
                </span>
              ))}
            </div>

            <p className="landing-tagline">{t("landingHeroContestTagline")}</p>

            <div className="cta-row landing-hero-actions">
              <Link className="primary-button landing-cta-primary" to="/dashboard">
                {t("openInboxCta")}
              </Link>
              <CreateFormLink className="ghost-button landing-cta-secondary">
                {t("composeSignalCta")}
              </CreateFormLink>
            </div>

            <div className="cta-row landing-hero-actions landing-hero-actions-secondary">
              <Link className="landing-hero-text-link" to="/explore">
                {t("landingHeroDemo")}
              </Link>
              <span className="landing-hero-proofline">{t("landingHeroContestProofline")}</span>
            </div>
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

              <div className="landing-hero-lifecycle" aria-label="Signal lifecycle">
                {heroLifecycle.map((step, index) => (
                  <span key={step} className={index < 4 ? "is-active" : ""}>
                    <i aria-hidden="true" />
                    {step}
                  </span>
                ))}
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
                        style={
                          {
                            "--bar-height": `${height * 100}%`,
                            "--bar-delay": `${index * -0.16}s`,
                          } as CSSProperties
                        }
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
                    <span>secure</span>
                    <span>storage ready</span>
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

              <p className="landing-hero-powered-by">{t("landingHeroPreviewPoweredBy")}</p>
            </article>
          </div>
        </div>
      </section>

      <UseCasesSection />
      <CorePrinciplesSection />
      <LiveSignalFlowSection />
      <FinalSignalCtaSection />
    </section>
  );
}
