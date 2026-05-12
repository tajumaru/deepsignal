import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { getPublicFormPath } from "../lib/publicLinks";
import { formatDate } from "../lib/utils";

interface ShareCardProps {
  formId: string;
  blobId?: string;
  createdAt?: string;
  manifestBlobId?: string;
}

function hashSeed(value: string) {
  return value.split("").reduce((accumulator, char) => accumulator + char.charCodeAt(0), 0);
}

export function ShareCard({ formId, blobId, createdAt, manifestBlobId }: ShareCardProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [qrMarkup, setQrMarkup] = useState("");
  const [beaconLocked, setBeaconLocked] = useState(false);

  const publicPath = getPublicFormPath(formId, manifestBlobId);
  const absoluteUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return publicPath;
    }
    return `${window.location.origin}${publicPath}`;
  }, [publicPath]);

  useEffect(() => {
    let cancelled = false;
    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toString(absoluteUrl, {
          type: "svg",
          margin: 1,
          width: 256,
          color: {
            dark: "#04131e",
            light: "#ffffff",
          },
        }),
      )
      .then((svg: string) => {
        if (!cancelled) {
          setQrMarkup(svg);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [absoluteUrl]);

  useEffect(() => {
    if (!qrMarkup) {
      return;
    }
    setBeaconLocked(false);
    const timeoutId = window.setTimeout(() => setBeaconLocked(true), 240);
    return () => window.clearTimeout(timeoutId);
  }, [qrMarkup]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error(error);
    }
  }

  const seed = hashSeed(`${formId}:${blobId ?? ""}`);
  const depthMeters = 3200 + (seed % 5400);
  const signalId = `SIG-${formId.slice(0, 8).toUpperCase()}`;
  const blobLabel = blobId ?? "pending-lock";
  const timestampLabel = createdAt ? formatDate(createdAt) : "Awaiting sync";

  return (
    <section className={`share-card beacon-card ${beaconLocked ? "is-locked" : "is-forming"}`}>
      <div className="beacon-bg-noise" aria-hidden="true" />
      <div className="beacon-bg-scanlines" aria-hidden="true" />
      <div className="beacon-particles" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, index) => (
          <span key={index} className={`beacon-particle beacon-particle-${(index % 4) + 1}`} />
        ))}
      </div>

      <div className="share-copy beacon-copy">
        <p className="eyebrow">{t("signalBeaconLabel")}</p>
        <h4>{t("signalBeaconTitle")}</h4>
        <p className="muted">{t("signalBeaconBody")}</p>
      </div>

      <div className="beacon-core" aria-label={t("signalBeaconTitle")}>
        <div className="beacon-rings" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="beacon-grid" aria-hidden="true">
          <span />
          <span />
        </div>
        <div className="beacon-frame">
          <div className="beacon-scan" aria-hidden="true" />
          <div className="beacon-qr-shell">
            {qrMarkup ? (
              <div
                className="beacon-qr-markup"
                dangerouslySetInnerHTML={{ __html: qrMarkup }}
              />
            ) : (
              <div className="beacon-qr-placeholder" aria-hidden="true" />
            )}
          </div>
        </div>
      </div>

      <div className="beacon-meta">
        <div className="beacon-meta-row">
          <span>{t("transmissionLinkLabel")}</span>
          <code>{publicPath}</code>
        </div>
        <div className="beacon-meta-grid">
          <div>
            <span>{t("blobIdLabel")}</span>
            <strong>{blobLabel}</strong>
          </div>
          <div>
            <span>{t("signalIdLabel")}</span>
            <strong>{signalId}</strong>
          </div>
          <div>
            <span>{t("createdTimestampLabel")}</span>
            <strong>{timestampLabel}</strong>
          </div>
          <div>
            <span>{t("depthLabel")}</span>
            <strong>{`DEPTH: ${depthMeters}m`}</strong>
          </div>
        </div>
        <div className="cta-row beacon-actions">
          <button type="button" className="primary-button" onClick={() => void handleCopy()}>
            {copied ? t("copied") : t("copyTransmissionLink")}
          </button>
          <a className="ghost-button" href={absoluteUrl} target="_blank" rel="noreferrer">
            {t("openTransmissionLink")}
          </a>
        </div>
      </div>
    </section>
  );
}
