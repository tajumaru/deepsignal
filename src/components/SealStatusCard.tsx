import { getSealRuntimeStatus } from "../crypto/cryptoFactory";
import { useI18n } from "../i18n";

interface SealStatusCardProps {
  encryptSubmissions?: boolean;
  encryptedBlobId?: string | null;
  canDecrypt?: boolean;
  walletAccessStatus?: string;
}

export function SealStatusCard({
  encryptSubmissions,
  encryptedBlobId,
  canDecrypt = false,
  walletAccessStatus = "Wallet Verified",
}: SealStatusCardProps) {
  const { t } = useI18n();
  const status = getSealRuntimeStatus();
  const sealMode = status.isFallback ? "fallback" : status.activeMode;

  return (
    <section className="panel seal-status-card">
      <p className="eyebrow">{t("encryptedSignalLabel")}</p>
      <h3>{t("sealStatusTitle")}</h3>
      <div className="proof-grid">
        <div className="proof-row">
          <span>{t("requestedModeLabel")}</span>
          <strong>{status.requestedMode}</strong>
        </div>
        <div className="proof-row">
          <span>{t("activeModeLabel")}</span>
          <strong>{status.activeMode}</strong>
        </div>
        <div className="proof-row">
          <span>{t("sealModeLabel")}</span>
          <strong>{sealMode}</strong>
        </div>
        <div className="proof-row">
          <span>{t("isFallbackLabel")}</span>
          <strong>{status.isFallback ? "true" : "false"}</strong>
        </div>
        <div className="proof-row">
          <span>{t("warningLabel")}</span>
          <strong>{status.warning ?? "none"}</strong>
        </div>
        <div className="proof-row">
          <span>{t("encryptionLabel")}</span>
          <strong>{encryptSubmissions ? t("enabled") : t("disabled")}</strong>
        </div>
        <div className="proof-row">
          <span>{t("encryptedBlobIdLabel")}</span>
          <strong className="blob-prominent">{encryptedBlobId ?? t("notAvailable")}</strong>
        </div>
        <div className="proof-row">
          <span>{t("walletAccessStatus")}</span>
          <strong>{walletAccessStatus}</strong>
        </div>
      </div>

      {encryptSubmissions ? (
        <p className="proof-callout">
          <strong>{t("encryptedPayloadStored")}</strong>
          {encryptedBlobId ? (
            <>
              {" "}
              <span className="blob-prominent">{encryptedBlobId}</span>
            </>
          ) : null}
        </p>
      ) : (
        <p className="muted">{t("encryptionDisabledForForm")}</p>
      )}

      {status.activeMode === "mock" ? (
        <p className="muted">{t("demoDecryptAvailable")}</p>
      ) : (
        <>
          <p className="muted">{t("policyGatedDecryption")}</p>
          <p className="muted">{t("walletApprovalRequired")}</p>
        </>
      )}

      {!canDecrypt && encryptSubmissions ? (
        <p className="warning-text">
          {t("connectCreatorWalletForDecrypt")}
        </p>
      ) : null}
    </section>
  );
}
