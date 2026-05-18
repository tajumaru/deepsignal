import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { getAbsolutePublicFormUrl, getPublicFormHashPath } from "../lib/publicLinks";
import { formatDate } from "../lib/utils";
import { formatSignalMetaValue } from "./SignalMetaChip";

interface ShareCardProps {
  formId: string;
  blobId?: string;
  createdAt?: string;
  manifestBlobId?: string;
}

function hashSeed(value: string) {
  return value.split("").reduce((accumulator, char) => accumulator + char.charCodeAt(0), 0);
}

function formatBeaconValue(value: string, headLength = 10, tailLength = 10) {
  if (value.length <= headLength + tailLength + 3) {
    return value;
  }
  return `${value.slice(0, headLength)}...${value.slice(-tailLength)}`;
}

function ShareActionIcon({ type }: { type: "copy" | "open" | "x" }) {
  if (type === "copy") {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
        <path d="M8 8h10v12H8z" />
        <path d="M6 16H4V4h10v2" />
      </svg>
    );
  }

  if (type === "open") {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
        <path d="M8 8h8v8" />
        <path d="m8 16 8-8" />
        <path d="M19 13v7H4V5h7" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
      <path d="m5 5 14 14" />
      <path d="M19 5 5 19" />
    </svg>
  );
}

interface CopyableBeaconValueProps {
  value: string;
  label: string;
  copied: boolean;
  onCopy: () => void;
  disabled?: boolean;
  headLength?: number;
  tailLength?: number;
  metaType?: "blob" | "manifest";
}

function CopyableBeaconValue({
  value,
  label,
  copied,
  onCopy,
  disabled = false,
  headLength,
  tailLength,
  metaType,
}: CopyableBeaconValueProps) {
  const displayValue = metaType ? formatSignalMetaValue(metaType, value) : formatBeaconValue(value, headLength, tailLength);

  return (
    <button
      type="button"
      className="beacon-copy-value"
      onClick={onCopy}
      disabled={disabled}
      title={value}
      aria-label={`${copied ? "Copied" : label}: ${value}`}
    >
      <code>{displayValue}</code>
      <span className="beacon-copy-value-status">{copied ? "Copied" : label}</span>
    </button>
  );
}

export function ShareCard({ formId, blobId, createdAt, manifestBlobId }: ShareCardProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [blobCopied, setBlobCopied] = useState(false);
  const [qrMarkup, setQrMarkup] = useState("");
  const [beaconLocked, setBeaconLocked] = useState(false);
  const [verifyingShareLink, setVerifyingShareLink] = useState(false);
  const [shareLinkError, setShareLinkError] = useState("");

  const publicPath = manifestBlobId ? getPublicFormHashPath(formId, manifestBlobId) : "";
  const absoluteUrl = useMemo(() => {
    return manifestBlobId ? getAbsolutePublicFormUrl(formId, manifestBlobId) : "";
  }, [formId, manifestBlobId]);
  const xShareUrl = useMemo(() => {
    const params = new URLSearchParams({
      text: t("xShareText"),
      url: absoluteUrl,
    });
    return `https://twitter.com/intent/tweet?${params.toString()}`;
  }, [absoluteUrl, t]);

  useEffect(() => {
    if (!absoluteUrl) {
      setQrMarkup("");
      return;
    }
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

  async function verifyManifestBeforeCopy() {
    if (!manifestBlobId) {
      return;
    }
    const { readJsonBlobOrThrow, readManifestWithForm } = await import("../lib/walrus");
    const carrier = await readManifestWithForm(manifestBlobId);
    if (carrier.manifest.formId !== formId) {
      throw new Error(t("shareLinkMismatchCopyBlocked"));
    }
    if (carrier.form) {
      if (carrier.form.id !== formId) {
        throw new Error(t("shareLinkMismatchCopyBlocked"));
      }
      return;
    }
    if (!carrier.manifest.formBlobId || carrier.manifest.formBlobId === "__bundled_form__") {
      throw new Error(t("shareLinkMissingFormCopyBlocked"));
    }
    const linkedForm = await readJsonBlobOrThrow<{ id?: string }>(carrier.manifest.formBlobId);
    if (linkedForm.id !== formId) {
      throw new Error(t("shareLinkMismatchCopyBlocked"));
    }
  }

  async function handleCopy() {
    if (!absoluteUrl) {
      setShareLinkError(t("shareLinkMissingFormCopyBlocked"));
      return;
    }
    setShareLinkError("");
    setVerifyingShareLink(true);
    try {
      await verifyManifestBeforeCopy();
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error(error);
      setShareLinkError(error instanceof Error ? error.message : t("shareLinkVerifyCopyBlocked"));
    } finally {
      setVerifyingShareLink(false);
    }
  }

  async function handleCopyBlobId() {
    if (!blobId) {
      return;
    }
    try {
      await navigator.clipboard.writeText(blobId);
      setBlobCopied(true);
      window.setTimeout(() => setBlobCopied(false), 1800);
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
          <div className="beacon-meta-link-copy">
            <span>{t("transmissionLinkLabel")}</span>
            <CopyableBeaconValue
              value={publicPath}
              label={verifyingShareLink ? t("verifyingManifest") : t("copyTransmissionLink")}
              copied={copied}
              onCopy={() => void handleCopy()}
              disabled={verifyingShareLink || !publicPath}
              headLength={16}
              tailLength={12}
            />
          </div>
          <div className="cta-row beacon-actions">
            <button
              type="button"
              className="primary-button beacon-action-button"
              onClick={() => void handleCopy()}
              disabled={verifyingShareLink}
              aria-label={verifyingShareLink ? t("verifyingManifest") : copied ? t("copied") : t("copyTransmissionLink")}
              title={verifyingShareLink ? t("verifyingManifest") : copied ? t("copied") : t("copyTransmissionLink")}
            >
              <ShareActionIcon type="copy" />
              <span className="sr-only">
                {verifyingShareLink ? t("verifyingManifest") : copied ? t("copied") : t("copyTransmissionLink")}
              </span>
            </button>
            <a
              className="ghost-button beacon-action-button"
              href={absoluteUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={t("openTransmissionLink")}
              title={t("openTransmissionLink")}
            >
              <ShareActionIcon type="open" />
              <span className="sr-only">{t("openTransmissionLink")}</span>
            </a>
            <a
              className="ghost-button beacon-action-button x-share-button"
              href={xShareUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={t("shareToX")}
              title={t("shareToX")}
            >
              <ShareActionIcon type="x" />
              <span className="sr-only">{t("shareToX")}</span>
            </a>
          </div>
        </div>
        {shareLinkError ? <p className="error-text">{shareLinkError}</p> : null}
        <div className="beacon-meta-grid">
          <div>
            <span>{t("blobIdLabel")}</span>
            {blobId ? (
              <CopyableBeaconValue
                value={blobId}
                label={t("copyBlobId")}
                copied={blobCopied}
                onCopy={() => void handleCopyBlobId()}
                metaType="blob"
              />
            ) : (
              <strong>{blobLabel}</strong>
            )}
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
      </div>
    </section>
  );
}
