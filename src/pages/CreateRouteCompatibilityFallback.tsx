import type { CSSProperties } from "react";
import { retryLazyImportCompatibilityReload } from "../lib/lazyImportCompatibility";

const shellStyle: CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top, rgba(80, 180, 255, 0.14), transparent 42%), linear-gradient(180deg, #07111d 0%, #0b1523 52%, #0d1726 100%)",
  color: "#ecf6ff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
};

const panelStyle: CSSProperties = {
  width: "100%",
  maxWidth: "520px",
  borderRadius: "24px",
  border: "1px solid rgba(140, 196, 255, 0.18)",
  background: "rgba(7, 16, 28, 0.86)",
  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.3)",
  padding: "24px",
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: "999px",
  border: "1px solid rgba(112, 196, 255, 0.35)",
  background: "rgba(30, 95, 140, 0.2)",
  color: "#9fd7ff",
  fontSize: "0.75rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const buttonStyle: CSSProperties = {
  border: "none",
  borderRadius: "14px",
  background: "linear-gradient(135deg, #7ee1ff 0%, #58a6ff 100%)",
  color: "#04111d",
  cursor: "pointer",
  fontSize: "0.95rem",
  fontWeight: 700,
  padding: "12px 16px",
};

export function CreateRouteCompatibilityFallback() {
  return (
    <main style={shellStyle}>
      <section style={panelStyle}>
        <div style={badgeStyle}>Compatibility Mode</div>
        <h1 style={{ margin: "16px 0 10px", fontSize: "1.8rem", lineHeight: 1.1 }}>
          Create is loading in compatibility mode
        </h1>
        <p style={{ margin: "0 0 12px", color: "rgba(236, 246, 255, 0.82)", lineHeight: 1.6 }}>
          DeepSignal kept the create workspace alive even though this WebView could not finish a CSS or preload step.
        </p>
        <p style={{ margin: "0 0 20px", color: "rgba(159, 215, 255, 0.9)", lineHeight: 1.6 }}>
          Drafts stay preserved. Wallet connection is not required for retrying this screen.
        </p>
        <button type="button" onClick={retryLazyImportCompatibilityReload} style={buttonStyle}>
          Retry create workspace
        </button>
      </section>
    </main>
  );
}

export default CreateRouteCompatibilityFallback;
