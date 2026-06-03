import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PublicSignalMetaChip } from "../../../components/PublicSignalMeta";
import { useI18n } from "../../../i18n";
import { isMobileSafariLike } from "../../../lib/routeDiagnostics";
import { getCurrentWalrusNetwork } from "../../../lib/walrusProof";
import type { Submission } from "../../../types";

interface PublicFormSuccessProps {
  submitted: Submission;
  submitNotice: string;
  notAvailableLabel: string;
  pendingSuiRegistrationLabel: string;
  signalReceivedLabel: string;
  thanksForFeedbackLabel: string;
}

function isPublicLocalFallbackBlob(blobId?: string | null) {
  if (!blobId) {
    return false;
  }
  return (
    blobId.startsWith("local-") ||
    blobId.startsWith("todo-") ||
    blobId.startsWith("walrus-form-") ||
    blobId.startsWith("walrus-submission-") ||
    blobId.startsWith("walrus-file-")
  );
}

function formatReceiptDate(value?: string) {
  if (!value) {
    return "Unknown";
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

const MASCOT_WIDTH = 220;
const MASCOT_HEIGHT = 275;
const MASCOT_WEBP_SRCSET = "/mascot-sealed.webp 1x, /mascot-sealed@2x.webp 2x";
const MASCOT_PNG_SRCSET = "/mascot-sealed.png 1x, /mascot-sealed@2x.png 2x";

function isIPhoneSafari() {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /iPhone/i.test(navigator.userAgent || "") && isMobileSafariLike(
    navigator.userAgent || "",
    navigator.platform || "",
    navigator.maxTouchPoints ?? 0,
  );
}

function SignalSealMascot({ compact = false, onLoad }: { compact?: boolean; onLoad?: () => void }) {
  const [loaded, setLoaded] = useState(false);

  function handleLoad() {
    setLoaded(true);
    onLoad?.();
  }

  return (
    <div
      className={`${compact ? "signal-seal-mascot is-compact" : "signal-seal-mascot"} ${loaded ? "is-loaded" : "is-loading"}`}
      aria-hidden="true"
    >
      <span className="signal-seal-mascot-glow" />
      <picture>
        <source srcSet={MASCOT_WEBP_SRCSET} type="image/webp" />
        <img
          src="/mascot-sealed.png"
          srcSet={MASCOT_PNG_SRCSET}
          width={MASCOT_WIDTH}
          height={MASCOT_HEIGHT}
          alt=""
          loading="eager"
          decoding="async"
          onLoad={handleLoad}
        />
      </picture>
      <span className="signal-seal-mascot-blink" />
    </div>
  );
}

export function PublicFormSuccess({
  submitted,
  submitNotice,
  notAvailableLabel,
  signalReceivedLabel,
}: PublicFormSuccessProps) {
  const { t } = useI18n();
  const location = useLocation();
  const [receiptVisible, setReceiptVisible] = useState(false);
  const textVisibleAtRef = useRef<number | null>(null);
  const mascotLoggedRef = useRef(false);
  const primaryBlobId = submitted.encryptedBlobId ?? submitted.blobId;
  const storedOnWalrus = Boolean(primaryBlobId && !isPublicLocalFallbackBlob(primaryBlobId));
  const remoteDelivered =
    submitted.remoteSyncStatus === "remote_synced" &&
    submitted.remoteIndexUpdated === true &&
    submitted.remoteIndexReadBack === true &&
    submitted.ownerReadable === true;
  const networkLabel = storedOnWalrus ? getCurrentWalrusNetwork() : "local";
  const submitAnotherHref = `${location.pathname}${location.search}`;
  const myResponseDetailHref = `/my-responses/${submitted.id}`;
  const receiptHash = submitted.signalReceiptMetadataDigest ?? submitted.receiptBlobId ?? submitted.blobId;
  const receiptStatus = remoteDelivered ? t("publicReceiptStatusSynced") : t("publicReceiptStatusPending");
  const inboxSyncLabel = remoteDelivered ? t("publicReceiptInboxSynced") : t("publicReceiptInboxPending");
  const ownerInboxLabel = remoteDelivered ? t("publicReceiptOwnerConfirmed") : t("publicReceiptOwnerPending");
  const relayLabel =
    submitted.remoteIndexTarget === "google-apps-script-drive"
      ? t("publicReceiptRelayDrive")
      : submitted.remoteIndexUpdated
        ? t("publicReceiptRelayAccepted")
        : t("publicReceiptRelayPending");

  useEffect(() => {
    if (typeof performance === "undefined") {
      return;
    }
    textVisibleAtRef.current = performance.now();
  }, [submitted.id]);

  function handleMascotLoad() {
    if (mascotLoggedRef.current || !isIPhoneSafari() || typeof performance === "undefined") {
      return;
    }
    mascotLoggedRef.current = true;
    const textVisibleAt = textVisibleAtRef.current ?? performance.now();
    const mascotVisibleAt = performance.now();
    console.info("[DeepSignal public receipt mascot]", {
      routeId: "public-form",
      platform: "iPhone Safari",
      textVisibleMs: Math.round(textVisibleAt),
      mascotVisibleMs: Math.round(mascotVisibleAt),
      mascotDelayMs: Math.round(mascotVisibleAt - textVisibleAt),
      image: "/mascot-sealed.webp",
      submissionId: submitted.id,
    });
  }

  return (
    <section className="stack">
      <section className="panel glow-panel success-screen signal-success-scene">
        <div className="signal-success-hero">
          <div className="signal-success-copy">
            <p className="eyebrow">{signalReceivedLabel}</p>
            <h1>{t("publicReceiptHeadline")}</h1>
            <p className="lede">
              {t("publicReceiptSubcopySaved")}
              <br />
              {t("publicReceiptSubcopyRetry")}
            </p>
            <div className="signal-success-status-row" aria-label="Signal status">
              <span className={`signal-success-status-chip ${remoteDelivered ? "is-complete" : "is-warning"}`}>
                <span className="signal-success-status-dot" />
                <strong>{receiptStatus}</strong>
              </span>
            </div>
          </div>
          <SignalSealMascot onLoad={handleMascotLoad} />
        </div>

        <div className="signal-success-actions" aria-label="Next actions">
          <Link to="/explore" className="primary-button signal-success-action">
            {t("publicReceiptBackToSignals")}
          </Link>
          <button
            type="button"
            className="ghost-button signal-success-action"
            aria-expanded={receiptVisible}
            onClick={() => setReceiptVisible((current) => !current)}
          >
            {t("publicReceiptViewReceipt")}
          </button>
        </div>
        <div className="signal-success-secondary-links">
          <Link to={myResponseDetailHref}>{t("publicReceiptTrackLifecycle")}</Link>
          {remoteDelivered ? <Link to={submitAnotherHref}>{t("publicReceiptSubmitAnother")}</Link> : null}
        </div>

        {receiptVisible ? (
          <section className="signal-receipt-certificate" aria-label={t("publicReceiptViewReceipt")}>
            <div className="signal-receipt-certificate-header">
              <span>{t("publicReceiptCertificateEyebrow")}</span>
              <strong>{t("publicReceiptHeadline")}</strong>
            </div>
            <div className="signal-receipt-certificate-grid">
              <div className="signal-receipt-field">
                <span>Signal ID</span>
                <PublicSignalMetaChip type="manifest" value={submitted.id} />
              </div>
              <div className="signal-receipt-field">
                <span>Submitted</span>
                <strong>{formatReceiptDate(submitted.createdAt)}</strong>
              </div>
              <div className="signal-receipt-field">
                <span>Status</span>
                <strong>{receiptStatus}</strong>
              </div>
              <div className="signal-receipt-field">
                <span>Network</span>
                <strong>{networkLabel}</strong>
              </div>
              <div className="signal-receipt-field is-wide">
                <span>Receipt hash</span>
                {receiptHash ? (
                  <PublicSignalMetaChip type={submitted.signalReceiptMetadataDigest ? "seal" : "blob"} value={receiptHash} />
                ) : (
                  <strong>{notAvailableLabel}</strong>
                )}
              </div>
            </div>
            <SignalSealMascot compact />
          </section>
        ) : null}

        <details className="answer-card public-submit-details signal-success-details">
          <summary>
            <span>
              <p className="eyebrow">{t("publicReceiptDetails")}</p>
            </span>
          </summary>
          <div className="metadata-list">
            <h3 className="signal-success-details-title">{t("publicReceiptDetailsTitle")}</h3>
            <div className="metadata-row">
              <span>Signal evidence</span>
              <strong>{storedOnWalrus ? "Saved to Walrus" : "Saved locally"}</strong>
            </div>
            <div className="metadata-row">
              <span>Inbox sync</span>
              <strong>{inboxSyncLabel}</strong>
            </div>
            <div className="metadata-row">
              <span>Relay</span>
              <strong>{relayLabel}</strong>
            </div>
            <div className="metadata-row">
              <span>Owner inbox</span>
              <strong>{ownerInboxLabel}</strong>
            </div>
            <div className="metadata-row">
              <span>Local receipt</span>
              <strong>Saved on this device</strong>
            </div>
            {!remoteDelivered && submitNotice ? <p className="muted signal-success-history-note">{submitNotice}</p> : null}
          </div>
        </details>
      </section>
    </section>
  );
}
