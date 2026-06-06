import { useEffect, useMemo, useState, type ReactNode } from "react";
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

interface SignalConsoleModuleProps {
  label: string;
  value?: string;
  children?: ReactNode;
  className?: string;
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

function ShareActionIcon({ type }: { type: "open" | "x" }) {
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

function SignalConsoleModule({ label, value, children, className }: SignalConsoleModuleProps) {
  return (
    <section className={`beacon-console-module ${className ?? ""}`.trim()}>
      <span>{label}</span>
      {value ? <strong>{value}</strong> : null}
      {children}
    </section>
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
    const { readJsonBlobOrThrow, readManifestWithForm } = await import("../lib/walrus/read");
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
  const storageProofLabel = manifestBlobId ? "Manifest verified" : "Awaiting manifest proof";
  const storageProofHint = blobId
    ? "Blob ID stays available for audit, recovery, and storage verification."
    : "Blob ID will appear here after storage confirmation.";

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

      <div className="beacon-core signal-beacon-layout" aria-label={t("signalBeaconTitle")}>
        <div className="beacon-core-label signal-processing-label" aria-hidden="true">
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
          <div className="beacon-qr-shell signal-qr">
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
          <SignalConsoleModule label={t("signalIdLabel")} value={signalId} className="is-primary-id" />
          <SignalConsoleModule label={t("status")} className="is-status-module">
            <div className={`beacon-status-console ${absoluteUrl ? "is-live" : "is-pending"}`}>
              <div className="beacon-status-heading">
                <span className="beacon-status-dot-wrap" aria-hidden="true">
                  <span className="beacon-status-dot-core" />
                </span>
                <strong>{signalStatus}</strong>
              </div>
              <small className="beacon-status-detail">
                {absoluteUrl ? "Signal is live. Ready to receive encrypted responses." : "Manifest handoff pending. Share link will arm after verification."}
              </small>
            </div>
          </SignalConsoleModule>
          <SignalConsoleModule label={t("depthLabel")} className="is-depth-module">
            <div className="beacon-depth-readout">
              <strong>{`${depthMeters}m`}</strong>
              <span className="beacon-depth-zone">HADAL TRACE</span>
            </div>
          </SignalConsoleModule>
          <SignalConsoleModule label={t("createdTimestampLabel")} value={timestampLabel} className="is-timestamp-module" />
          <details className="beacon-storage-disclosure">
            <summary>
              <span>
                <span className="beacon-storage-label">Storage Proof</span>
                <strong>{storageProofLabel}</strong>
              </span>
            </summary>
            <div className="beacon-storage-proof-body">
              <SignalConsoleModule label={t("blobIdLabel")} className="is-storage-proof-module">
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
                <small className="beacon-storage-proof-hint">{storageProofHint}</small>
              </SignalConsoleModule>
            </div>
          </details>
        </div>
        <div className="beacon-action-panel" aria-label={t("transmissionLinkLabel")}>
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
