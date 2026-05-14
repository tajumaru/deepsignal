import { getSealRuntimeStatus } from "../crypto/cryptoFactory";
import { REAL_SEAL_SESSION_TTL_MIN } from "../crypto/sealPayload";
import { useI18n } from "../i18n";
import { SignalMetaChip, SignalMetaRow } from "./SignalMetaChip";

interface SealStatusCardProps {
  encryptSubmissions?: boolean;
  encryptedBlobId?: string | null;
  encryptedPayloadEmbedded?: boolean;
  canDecrypt?: boolean;
  walletAccessStatus?: string;
}

export function SealStatusCard({
  encryptSubmissions,
  encryptedBlobId,
  encryptedPayloadEmbedded = false,
  canDecrypt = false,
  walletAccessStatus = "Wallet Verified",
}: SealStatusCardProps) {
  const { t } = useI18n();
  const status = getSealRuntimeStatus();
  const sealMode = status.activeMode.toUpperCase();
  const encryptedPayloadStatus = encryptedBlobId
    ? "Available as dedicated blob"
    : encryptedPayloadEmbedded
      ? "Encrypted payload stored in submission bundle"
      : t("notAvailable");

  return (
    <section className="panel seal-status-card">
      <p className="eyebrow">Seal / Encryption</p>
      <h3>Private signal details</h3>
      <p className="muted">
        Open this only when you need to verify how the encrypted payload is stored or how reviewer access is being resolved.
      </p>
      <div className="proof-grid">
        <div className="proof-row">
          <span>{t("requestedModeLabel")}</span>
          <strong>{status.requestedMode.toUpperCase()}</strong>
        </div>
        <div className="proof-row">
          <span>{t("activeModeLabel")}</span>
          <strong>{status.activeMode.toUpperCase()}</strong>
        </div>
        <div className="proof-row">
          <span>{t("sealModeLabel")}</span>
          <strong>{sealMode}</strong>
        </div>
        <div className="proof-row">
          <span>Seal encrypted</span>
          <strong>{encryptSubmissions ? "required" : "sensitive fields only"}</strong>
        </div>
        <div className="proof-row">
          <span>{t("warningLabel")}</span>
          <strong>{status.warning ?? "none"}</strong>
        </div>
        <div className="proof-row">
          <span>Decryption required</span>
          <strong>{encryptSubmissions ? "creator/admin only" : "as needed"}</strong>
        </div>
        <div className="proof-row">
          <span>{t("encryptionLabel")}</span>
          <strong>{encryptSubmissions ? t("enabled") : t("disabled")}</strong>
        </div>
        {encryptedBlobId ? (
          <SignalMetaRow
            label={t("encryptedBlobIdLabel")}
            type="seal"
            value={encryptedBlobId}
          />
        ) : null}
        <div className="proof-row">
          <span>{t("walletAccessStatus")}</span>
          <strong>{walletAccessStatus}</strong>
        </div>
      </div>

      {encryptSubmissions ? (
        <p className="proof-callout">
          <strong>{encryptedPayloadStatus}</strong>
          {encryptedBlobId ? <span className="signal-meta-inline"><SignalMetaChip type="seal" value={encryptedBlobId} /></span> : null}
        </p>
      ) : (
        <p className="muted">{t("encryptionDisabledForForm")}</p>
      )}

      <p className="muted">Seal Runtime: {sealMode}</p>
      <p className="muted">Creator/admin only access. Reviewer wallet approval is required before private responses are revealed.</p>
      <p className="muted">{t("walletApprovalReuseNotice", { minutes: REAL_SEAL_SESSION_TTL_MIN })}</p>

      {!canDecrypt && encryptSubmissions ? (
        <p className="warning-text">
          {t("connectCreatorWalletForDecrypt")}
        </p>
      ) : null}
    </section>
  );
}
