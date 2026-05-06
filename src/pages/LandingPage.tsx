import { Link } from "react-router-dom";
import { useI18n } from "../i18n";

export function LandingPage() {
  const { t } = useI18n();

  return (
    <section className="hero-layout">
      <div className="hero-copy panel glow-panel">
        <p className="eyebrow">{t("landingEyebrow")}</p>
        <h1>{t("landingTitle")}</h1>
        <p className="lede">{t("landingBody")}</p>
        <div className="cta-row">
          <Link className="primary-button" to="/admin/forms/new">
            {t("landingCreate")}
          </Link>
          <Link className="ghost-button" to="/admin">
            {t("landingAdmin")}
          </Link>
        </div>
      </div>

      <div className="panel feature-panel">
        <h2>{t("landingWhy")}</h2>
        <ul className="feature-list">
          <li>{t("landingFeature1")}</li>
          <li>{t("landingFeature2")}</li>
          <li>{t("landingFeature3")}</li>
          <li>{t("landingFeature4")}</li>
        </ul>
      </div>
    </section>
  );
}
