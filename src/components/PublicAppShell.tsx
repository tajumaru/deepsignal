import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import { BuildIndicator } from "./system/BuildIndicator";
import type { PropsWithChildren } from "react";
import "../styles/public-shell-entry.css";

function shouldShowPublicBuildIndicator() {
  if (import.meta.env.DEV || typeof window === "undefined") {
    return import.meta.env.DEV;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const hashQuery = window.location.hash.includes("?") ? window.location.hash.split("?").slice(1).join("?") : "";
  const hashParams = new URLSearchParams(hashQuery);
  return searchParams.has("debugBuild") || hashParams.has("debugBuild");
}

export function PublicAppShell({ children }: PropsWithChildren) {
  const { language, setLanguage, t } = useI18n();
  const showBuildIndicator = shouldShowPublicBuildIndicator();

  return (
    <div className="app-shell public-app-shell">
      <header className="topbar panel topbar-public public-app-topbar">
        <Link className="brand desktop-topbar-brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            <img src="/deepsignal-mark.svg" alt="" />
          </span>
          <div className="brand-copy">
            <strong>DeepSignal</strong>
            <p>{t("brandTagline")}</p>
          </div>
        </Link>
        <div className="topbar-actions desktop-topbar-actions">
          <label className="language-switch">
            <span>{t("languageLabel")}</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as "en" | "ja")}
            >
              <option value="en">{t("languageEnglish")}</option>
              <option value="ja">{t("languageJapanese")}</option>
            </select>
          </label>
        </div>
      </header>
      <main className="page-wrap">{children}</main>
      {showBuildIndicator ? <BuildIndicator compact /> : null}
    </div>
  );
}
