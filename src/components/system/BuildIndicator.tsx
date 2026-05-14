import { buildInfo } from "../../lib/buildInfo";

export function BuildIndicator() {
  const copyBuildInfo = () => {
    if (!navigator.clipboard) {
      return;
    }

    void navigator.clipboard.writeText(buildInfo.copyText);
  };

  return (
    <footer className="build-indicator" aria-label="Build information">
      <button
        className="build-indicator-button"
        type="button"
        onClick={copyBuildInfo}
        title="Copy build info"
      >
        {buildInfo.label}
      </button>
    </footer>
  );
}
