import { getSealRuntimeStatus } from "../crypto/cryptoFactory";
import { REAL_SEAL_SESSION_TTL_MIN } from "../lib/seal";
import { useI18n } from "../i18n";
interface SealStatusCardProps {
  encryptSubmissions?: boolean;
  canDecrypt?: boolean;
}

export function SealStatusCard({
  encryptSubmissions,
  canDecrypt = false,
}: SealStatusCardProps) {
  const { t } = useI18n();
  const status = getSealRuntimeStatus();
  const activeMode = status.activeMode.toUpperCase();
  const requestedMode = status.requestedMode.toUpperCase();
  const runtimeMode = requestedMode === activeMode ? activeMode : `${requestedMode} -> ${activeMode}`;

  return (
    <section className="panel seal-status-card">
      <p className="eyebrow">Seal / Encryption</p>
      <h3>Private signal details</h3>
      <p className="muted">
        Open this only when you need to verify how the encrypted payload is stored or how reviewer access is being resolved.
      </p>
      <div className="proof-grid">
        <div className="proof-row">
          <span>{t("sealRuntimeLabel")}</span>
          <strong>{runtimeMode}</strong>
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
      </div>

      {!encryptSubmissions ? (
        <p className="muted">{t("encryptionDisabledForForm")}</p>
      ) : null}

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
