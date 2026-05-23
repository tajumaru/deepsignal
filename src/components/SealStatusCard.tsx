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
      <p className="eyebrow">{t("sealEncryptionEyebrow")}</p>
      <h3>{t("privateSignalDetailsTitle")}</h3>
      <p className="muted">{t("privateSignalDetailsBody")}</p>
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
          <span>{t("decryptionRequiredLabel")}</span>
          <strong>{encryptSubmissions ? t("creatorAdminOnly") : t("asNeeded")}</strong>
        </div>
        <div className="proof-row">
          <span>{t("encryptionLabel")}</span>
          <strong>{encryptSubmissions ? t("enabled") : t("disabled")}</strong>
        </div>
      </div>

      {!encryptSubmissions ? (
        <p className="muted">{t("encryptionDisabledForForm")}</p>
      ) : null}

      <p className="muted">{t("creatorAdminOnlyAccessBody")}</p>
      <p className="muted">{t("walletApprovalReuseNotice", { minutes: REAL_SEAL_SESSION_TTL_MIN })}</p>

      {!canDecrypt && encryptSubmissions ? (
        <p className="warning-text">
          {t("connectCreatorWalletForDecrypt")}
        </p>
      ) : null}
    </section>
  );
}
