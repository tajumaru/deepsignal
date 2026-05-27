import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { getAbsolutePublicFormUrl } from "../lib/publicLinks";
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

function ShareActionIcon({ type }: { type: "copy" | "open" | "signal" | "x" }) {
  if (type === "copy") {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
        <path d="M8 8h10v12H8z" />
        <path d="M6 16H4V4h10v2" />
      </svg>
    );
  }

  if (type === "signal") {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
        <path d="M12 4v16" />
        <path d="M5 8c4.2 2.8 9.8 2.8 14 0" />
        <path d="M5 16c4.2-2.8 9.8-2.8 14 0" />
        <path d="M8 12h8" />
      </svg>
    );
  }

  if (type === "x") {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
        <path d="m5 5 14 14" />
        <path d="m19 5-5.8 6.6" />
        <path d="m10.8 12.4-5.8 6.6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
      <path d="M8 8h8v8" />
      <path d="m8 16 8-8" />
      <path d="M19 13v7H4V5h7" />
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

function getBeaconRarity(seed: number) {
  const roll = seed % 100;
  if (roll >= 97) {
    return "BLACK SIGNAL";
  }
  if (roll >= 88) {
    return "ABYSSAL";
  }
  if (roll >= 70) {
    return "EPIC";
  }
  if (roll >= 38) {
    return "RARE";
  }
  return "COMMON";
}

export function ShareCard({ formId, blobId, createdAt, manifestBlobId }: ShareCardProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [blobCopied, setBlobCopied] = useState(false);
  const [qrMarkup, setQrMarkup] = useState("");
  const [beaconLocked, setBeaconLocked] = useState(false);
  const [verifyingShareLink, setVerifyingShareLink] = useState(false);
  const [shareLinkError, setShareLinkError] = useState("");

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

  async function verifyManifestBeforeShare() {
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
      await verifyManifestBeforeShare();
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

  async function handleXShare() {
    if (!absoluteUrl) {
      setShareLinkError(t("shareLinkMissingFormCopyBlocked"));
      return;
    }
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setShareLinkError(t("shareLinkVerifyCopyBlocked"));
      return;
    }
    popup.opener = null;
    setShareLinkError("");
    setVerifyingShareLink(true);
    try {
      await verifyManifestBeforeShare();
      popup.location.href = xShareUrl;
    } catch (error) {
      console.error(error);
      popup.close();
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
  const rarity = getBeaconRarity(seed);
  const signalStatus = absoluteUrl ? "LINK ARMED" : "AWAITING MANIFEST";

  return (
    <section className={`share-card beacon-card rarity-${rarity.toLowerCase().replace(/\s+/g, "-")} ${beaconLocked ? "is-locked" : "is-forming"}`}>
      <div className="beacon-bg-noise" aria-hidden="true" />
      <div className="beacon-bg-scanlines" aria-hidden="true" />
      <div className="beacon-particles" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, index) => (
          <span key={index} className={`beacon-particle beacon-particle-${(index % 4) + 1}`} />
        ))}
      </div>

      <div className="share-copy beacon-copy">
        <div className="beacon-classification">
          <div>
            <span>SIGNAL CLASSIFICATION</span>
            <strong>OBSERVATION ARTIFACT</strong>
          </div>
          <span className="beacon-rarity-badge">{rarity}</span>
        </div>
        <p className="eyebrow">SIGNAL ARTIFACT CARD</p>
        <h4>{t("signalBeaconTitle")}</h4>
        <p className="muted">{t("signalBeaconBody")}</p>
      </div>

      <div className="beacon-core" aria-label={t("signalBeaconTitle")}>
        <div className="beacon-core-label" aria-hidden="true">
          <span>SIGNAL CORE</span>
        </div>
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
            <strong>{`${depthMeters}m / HADAL TRACE`}</strong>
          </div>
          <div>
            <span>{t("status")}</span>
            <strong>{signalStatus}</strong>
          </div>
        </div>
        <div className="beacon-action-panel" aria-label={t("transmissionLinkLabel")}>
          <button
            type="button"
            className="primary-button beacon-action-button"
            onClick={() => void handleCopy()}
            disabled={verifyingShareLink}
            aria-label={verifyingShareLink ? t("verifyingManifest") : copied ? t("copied") : t("copyTransmissionLink")}
            title={verifyingShareLink ? t("verifyingManifest") : copied ? t("copied") : t("copyTransmissionLink")}
          >
            <ShareActionIcon type="signal" />
            <span>{verifyingShareLink ? t("verifyingManifest") : copied ? t("copied") : t("copyLink")}</span>
          </button>
          <button
            type="button"
            className="ghost-button beacon-action-button"
            onClick={() => void handleCopyBlobId()}
            disabled={!blobId}
            aria-label={blobCopied ? t("copied") : t("copyBlobId")}
            title={blobCopied ? t("copied") : t("copyBlobId")}
          >
            <ShareActionIcon type="copy" />
            <span>{blobCopied ? t("copied") : t("copyBlobId")}</span>
          </button>
          <button
            type="button"
            className="ghost-button beacon-action-button x-share-button"
            onClick={() => void handleXShare()}
            disabled={verifyingShareLink || !absoluteUrl}
            aria-label={t("shareToX")}
            title={t("shareToX")}
          >
            <ShareActionIcon type="x" />
            <span>{t("shareToX")}</span>
          </button>
          <a
            className="ghost-button beacon-action-button beacon-open-link"
            href={absoluteUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t("openTransmissionLink")}
            title={t("openTransmissionLink")}
          >
            <ShareActionIcon type="open" />
            <span className="sr-only">{t("openTransmissionLink")}</span>
          </a>
        </div>
      </div>
    </section>
  );
}
