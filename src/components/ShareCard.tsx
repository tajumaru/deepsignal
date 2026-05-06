import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useI18n } from "../i18n";

interface ShareCardProps {
  formId: string;
}

export function ShareCard({ formId }: ShareCardProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const publicPath = `/f/${formId}`;
  const absoluteUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return publicPath;
    }
    return `${window.location.origin}${publicPath}`;
  }, [publicPath]);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(absoluteUrl, {
      margin: 1,
      width: 220,
      color: {
        dark: "#dffbff",
        light: "#00000000",
      },
    }).then((url: string) => {
      if (!cancelled) {
        setQrDataUrl(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [absoluteUrl]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <div className="share-card">
      <div className="share-copy">
        <h4>{t("shareTitle")}</h4>
        <p className="muted">{t("shareBody")}</p>
        <div className="share-link-box">
          <code>{publicPath}</code>
        </div>
        <div className="cta-row">
          <button type="button" className="primary-button" onClick={() => void handleCopy()}>
            {copied ? t("copied") : t("copyShareUrl")}
          </button>
          <a className="ghost-button" href={absoluteUrl} target="_blank" rel="noreferrer">
            {t("openShareLink")}
          </a>
        </div>
      </div>
      <div className="qr-panel">
        <p className="eyebrow">{t("qrCode")}</p>
        {qrDataUrl ? <img className="qr-image" src={qrDataUrl} alt={t("qrCode")} /> : null}
      </div>
    </div>
  );
}
