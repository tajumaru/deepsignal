import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
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
          <Link className="ghost-button landing-cta-secondary" to="/admin/forms/new">
            {t("landingExploreCtaSecondary")}
          </Link>
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
            <Link className="ghost-button landing-cta-secondary" to="/admin/forms/new">
              {t("landingInboxCtaSecondary")}
            </Link>
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

export function LandingPage() {
  const { t } = useI18n();

  return (
    <section className="landing-shell">
      <div className="landing-page-atmosphere" aria-hidden="true" />

      <section className="landing-hero-console panel glow-panel">
        <div className="landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="eyebrow">{t("landingHeroEyebrow")}</p>

            <h1 className="landing-hero-title">
              <span>Deep</span>
              <span className="landing-hero-title-accent">Signal</span>
            </h1>

            <p className="landing-tagline">{t("landingHeroTagline")}</p>

            <p className="lede">{t("landingHeroBody")}</p>

            <div className="cta-row landing-hero-actions">
              <Link className="primary-button landing-cta-primary" to="/admin/forms/new">
                {t("landingHeroCreate")}
              </Link>
              <Link className="ghost-button landing-cta-secondary" to="/dashboard">
                {t("landingHeroDemo")}
              </Link>
            </div>
          </div>

          <div className="landing-sonar-column" aria-hidden="true">
            <div className="landing-sonar-panel">
              <div className="landing-sonar-hud">
                <span>{t("landingSonarInbox")}</span>
                <span>{t("landingSonarRelay")}</span>
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
                  <span>{t("landingSonarPublic")}</span>
                  <strong>{t("landingSonarPublicBody")}</strong>
                </div>
                <div className="landing-sonar-legend-card">
                  <span>{t("landingSonarPrivate")}</span>
                  <strong>{t("landingSonarPrivateBody")}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ExploreIntroSection />
      <SignalInboxIntroSection />
    </section>
  );
}
