import { useDisconnectWallet } from "@mysten/dapp-kit";
import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { DecryptDiagnosticContext } from "../crypto/decryptDiagnostics";
import { useI18n } from "../i18n";
import { sanitizeCsvCell } from "../lib/csv";
import {
  didResetFullySucceed,
  RESET_CONFIRMATION_MESSAGE,
  RESET_FAILURE_MESSAGE,
  RESET_SUCCESS_MESSAGE,
  resetLocalEnvironment,
} from "../lib/resetEnvironment";
import { downloadTextFile } from "../lib/utils";
import { SealedSignalCapsule } from "./SealedSignalCapsule";

type UnlockState =
  | "locked"
  | "checking_access"
  | "waiting_wallet_approval"
  | "decrypting"
  | "decrypted"
  | "unauthorized"
  | "failed";

interface PrivateSignalUnlockCardProps {
  onUnlock: () => void;
  onHideUnlocked?: () => void;
  onClearDebugCache?: () => void;
  onCancel?: () => void;
  isDecrypting: boolean;
  isUnlocked: boolean;
  actionLabel?: string;
  mobileActionLabel?: string;
  mobileUnlockedActionLabel?: string;
  unlockState?: UnlockState;
  statusMessage?: string;
  errorMessage?: string;
  diagnostics?: DecryptDiagnosticContext | null;
  disabledReason?: string;
  actionDisabled?: boolean;
  children?: ReactNode;
  supportContent?: ReactNode;
}

function formatDebugValue(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return "n/a";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function formatCsvTimestamp(now = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
  ].join("");
}

function getSealPolicyDebugErrorMessages(diagnostics: DecryptDiagnosticContext, errorMessage?: string) {
  const messages = [errorMessage];
  if (diagnostics.policySnapshotComparison && !diagnostics.policySnapshotComparison.matches) {
    messages.push(
      "Encrypt policy and decrypt policy differ. Decryption must use the same canonical package, capability, object, network, and policy JSON that were used at encryption time.",
    );
  }
  return messages.filter((message): message is string => Boolean(message));
}

function downloadSealPolicyDebugCsv(diagnostics: DecryptDiagnosticContext, errorMessage?: string) {
  const rows = [
    ["field", "value"],
    ["error", getSealPolicyDebugErrorMessages(diagnostics, errorMessage).join(" | ")],
    ["responseId", formatDebugValue(diagnostics.responseId)],
    ["walletAddress", formatDebugValue(diagnostics.walletAddress)],
    ["manifestBlobId", formatDebugValue(diagnostics.manifestBlobId)],
    ["submissionBlobId", formatDebugValue(diagnostics.submissionBlobId)],
    ["receiptBlobId", formatDebugValue(diagnostics.receiptBlobId)],
    ["packageId", formatDebugValue(diagnostics.packageId)],
    ["policyHash", formatDebugValue(diagnostics.policyHash)],
    ["policyId", formatDebugValue(diagnostics.policyId)],
    ["policyObjectId", formatDebugValue(diagnostics.policyObjectId)],
    ["accessObjectId", formatDebugValue(diagnostics.accessObjectId)],
    ["capabilityType", formatDebugValue(diagnostics.capabilityType)],
    ["encryptedBlobId", formatDebugValue(diagnostics.encryptedBlobId)],
    ["gateway", formatDebugValue(diagnostics.gateway)],
    ["source", formatDebugValue(diagnostics.source)],
    ["encryptPolicySnapshot", formatDebugValue(diagnostics.encryptPolicySnapshot)],
    ["decryptPolicySnapshot", formatDebugValue(diagnostics.decryptPolicySnapshot)],
    ["policySnapshotComparison", formatDebugValue(diagnostics.policySnapshotComparison)],
    ["requiredCapabilityObjects", formatDebugValue(diagnostics.requiredCapabilityObjects)],
    ["ownedCapabilityObjects", formatDebugValue(diagnostics.ownedCapabilityObjects)],
    ["objectIdSources", formatDebugValue(diagnostics.objectIdSources)],
    ["encryptedPayloadShape", formatDebugValue(diagnostics.encryptedPayloadShape)],
  ];
  const csv = `\uFEFF${rows.map((row) => row.map((cell) => sanitizeCsvCell(formatDebugValue(cell))).join(",")).join("\r\n")}`;
  const responsePart = diagnostics.responseId ? `-${diagnostics.responseId}` : "";
  downloadTextFile(
    `deepsignal-seal-policy-debug${responsePart}-${formatCsvTimestamp()}.csv`,
    csv,
    "text/csv;charset=utf-8",
  );
}

function PolicyMismatchNotice({ diagnostics }: { diagnostics: DecryptDiagnosticContext }) {
  const { t } = useI18n();
  const comparison = diagnostics.policySnapshotComparison;
  if (!comparison || comparison.matches) {
    return null;
  }
  return (
    <div className="seal-policy-debug-alert" role="alert">
      {t("sealPolicyMismatchNotice")}
    </div>
  );
}

function PolicyDiffRows({ diagnostics }: { diagnostics: DecryptDiagnosticContext }) {
  const { t } = useI18n();
  const diffs = diagnostics.policySnapshotComparison?.diffs ?? [];
  if (diffs.length === 0) {
    return <pre>{formatDebugValue(diagnostics.policySnapshotComparison?.differingKeys.join(", "))}</pre>;
  }
  return (
    <table className="seal-policy-diff-table">
      <thead>
        <tr>
          <th>{t("sealPolicyDiffField")}</th>
          <th>{t("sealPolicyDiffEncrypt")}</th>
          <th>{t("sealPolicyDiffDecrypt")}</th>
        </tr>
      </thead>
      <tbody>
        {diffs.map((diff) => (
          <tr key={diff.key} className={diff.key === "objectId" || diff.key === "policyObjectId" ? "is-critical" : ""}>
            <td>{diff.key}</td>
            <td>{formatDebugValue(diff.encryptValue)}</td>
            <td>{formatDebugValue(diff.decryptValue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SealPolicyDebugPanel({
  diagnostics,
  errorMessage,
}: {
  diagnostics: DecryptDiagnosticContext;
  errorMessage?: string;
}) {
  const { t } = useI18n();
  const encryptRawPolicyJson =
    diagnostics.encryptPolicySnapshot?.rawPolicyJson ??
    (diagnostics.encryptPolicySnapshot ? JSON.stringify(diagnostics.encryptPolicySnapshot, null, 2) : undefined);
  const decryptRawPolicyJson =
    diagnostics.decryptPolicySnapshot?.rawPolicyJson ??
    (diagnostics.decryptPolicySnapshot ? JSON.stringify(diagnostics.decryptPolicySnapshot, null, 2) : undefined);
  const rows = [
    [t("sealPolicyRowPolicyHash"), diagnostics.policyHash ?? diagnostics.decryptPolicySnapshot?.policyHash],
    [t("sealPolicyRowPackageId"), diagnostics.packageId ?? diagnostics.decryptPolicySnapshot?.packageId],
    [t("sealPolicyRowCapabilityType"), diagnostics.capabilityType ?? diagnostics.decryptPolicySnapshot?.capabilityType],
    [t("sealPolicyRowEnvelopeObjectId"), diagnostics.accessObjectId],
    [t("sealPolicyRowEnvelopePolicyObjectId"), diagnostics.policyObjectId],
    [t("sealPolicyRowEncryptPolicyObjectId"), diagnostics.encryptPolicySnapshot?.objectId],
    [t("sealPolicyRowEncryptPolicyPolicyObjectId"), diagnostics.encryptPolicySnapshot?.policyObjectId],
    [t("sealPolicyRowDecryptPolicyObjectId"), diagnostics.decryptPolicySnapshot?.objectId],
    [t("sealPolicyRowDecryptPolicyPolicyObjectId"), diagnostics.decryptPolicySnapshot?.policyObjectId],
    [t("sealPolicyRowWalletAddress"), diagnostics.walletAddress ?? diagnostics.decryptPolicySnapshot?.walletAddress],
    [t("sealPolicyRowPolicyMatch"), diagnostics.policySnapshotComparison?.matches],
    [t("sealPolicyRowPolicyDiff"), diagnostics.policySnapshotComparison?.differingKeys.join(", ")],
  ] as const;

  return (
    <details className="seal-policy-debug-panel" open={Boolean(diagnostics.policySnapshotComparison && !diagnostics.policySnapshotComparison.matches)}>
      <summary>
        <span>{t("sealPolicyDebugTitle")}</span>
        <button
          type="button"
          className="ghost-button seal-policy-debug-export-button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            downloadSealPolicyDebugCsv(diagnostics, errorMessage);
          }}
        >
          {t("exportCsv")}
        </button>
      </summary>
      <PolicyMismatchNotice diagnostics={diagnostics} />
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{formatDebugValue(value)}</dd>
          </div>
        ))}
      </dl>
      <div className="seal-policy-debug-grid">
        <div>
          <strong>{t("sealPolicyObjectIdSources")}</strong>
          <pre>{formatDebugValue(diagnostics.objectIdSources)}</pre>
        </div>
        <div>
          <strong>{t("sealPolicyRequiredCapabilityObjects")}</strong>
          <pre>{formatDebugValue(diagnostics.requiredCapabilityObjects)}</pre>
        </div>
        <div>
          <strong>{t("sealPolicyOwnedCapabilityObjects")}</strong>
          <pre>{formatDebugValue(diagnostics.ownedCapabilityObjects)}</pre>
        </div>
      </div>
      <div className="seal-policy-debug-grid">
        <div>
          <strong>{t("sealPolicyEncryptRawJson")}</strong>
          <pre>{formatDebugValue(encryptRawPolicyJson)}</pre>
        </div>
        <div>
          <strong>{t("sealPolicyDecryptRawJson")}</strong>
          <pre>{formatDebugValue(decryptRawPolicyJson)}</pre>
        </div>
      </div>
      <div className="seal-policy-debug-grid">
        <div>
          <strong>{t("sealPolicyEncryptCanonicalJson")}</strong>
          <pre>{formatDebugValue(diagnostics.encryptPolicySnapshot?.normalizedPolicyJson)}</pre>
        </div>
        <div>
          <strong>{t("sealPolicyDecryptCanonicalJson")}</strong>
          <pre>{formatDebugValue(diagnostics.normalizedPolicyJson ?? diagnostics.decryptPolicySnapshot?.normalizedPolicyJson)}</pre>
        </div>
      </div>
      <div className="seal-policy-debug-grid seal-policy-debug-grid-wide">
        <div>
          <strong>{t("sealPolicyFieldDiff")}</strong>
          <PolicyDiffRows diagnostics={diagnostics} />
        </div>
      </div>
    </details>
  );
}

const unlockSteps: Array<{ key: "locked" | "waiting_wallet_approval" | "decrypting" | "decrypted" | "failed"; labelKey: Parameters<ReturnType<typeof useI18n>["t"]>[0] }> = [
  { key: "locked", labelKey: "privateSignalUnlockStepLocked" },
  { key: "waiting_wallet_approval", labelKey: "privateSignalUnlockStepWaitingWalletApproval" },
  { key: "decrypting", labelKey: "privateSignalUnlockStepDecrypting" },
  { key: "decrypted", labelKey: "privateSignalUnlockStepUnlocked" },
  { key: "failed", labelKey: "privateSignalUnlockStepFailed" },
];

export function PrivateSignalUnlockCard({
  onUnlock,
  onHideUnlocked,
  onClearDebugCache,
  onCancel,
  isDecrypting,
  isUnlocked,
  actionLabel,
  mobileActionLabel,
  mobileUnlockedActionLabel,
  unlockState,
  statusMessage,
  errorMessage,
  diagnostics,
  disabledReason,
  actionDisabled = false,
  children,
  supportContent,
}: PrivateSignalUnlockCardProps) {
  const { t } = useI18n();
  const disconnectWallet = useDisconnectWallet();
  const [recoveryToast, setRecoveryToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [recoveryAction, setRecoveryAction] = useState<"reset" | "reconnect" | null>(null);
  const state = isUnlocked
    ? "decrypted"
    : (unlockState ?? (isDecrypting ? "decrypting" : errorMessage ? "failed" : "locked"));
  const resolvedStatusMessage =
    errorMessage ||
    statusMessage ||
    disabledReason;
  const cardTone =
    state === "unauthorized" || state === "failed"
      ? "error"
      : state === "decrypted"
        ? "success"
        : state === "waiting_wallet_approval" || state === "decrypting" || state === "checking_access"
          ? "loading"
          : state;
  const activeStep =
    state === "checking_access"
      ? "waiting_wallet_approval"
      : state === "unauthorized"
        ? "failed"
        : state;
  const capsuleState =
    state === "decrypted"
      ? "granted"
      : state === "unauthorized" || state === "failed"
        ? "error"
        : state === "checking_access" || state === "waiting_wallet_approval" || state === "decrypting" || isDecrypting
          ? "verifying"
          : "locked";
  const capsuleDisabled = actionDisabled || (state === "decrypted" && !onHideUnlocked);
  const showRecoveryActions = state === "failed" || state === "unauthorized";

  async function handleResetLocalState() {
    if (typeof window !== "undefined" && !window.confirm(RESET_CONFIRMATION_MESSAGE)) {
      return;
    }
    setRecoveryAction("reset");
    setRecoveryToast(null);
    try {
      const results = await resetLocalEnvironment({
        includeWalletDisconnect: true,
        disconnectWallet: () => disconnectWallet.mutateAsync(),
      });
      const succeeded = didResetFullySucceed(results);
      setRecoveryToast({
        tone: succeeded ? "success" : "error",
        message: succeeded ? RESET_SUCCESS_MESSAGE : RESET_FAILURE_MESSAGE,
      });
      if (succeeded && typeof window !== "undefined") {
        window.setTimeout(() => {
          window.location.assign("/");
        }, 900);
      }
    } catch {
      setRecoveryToast({ tone: "error", message: RESET_FAILURE_MESSAGE });
    } finally {
      setRecoveryAction(null);
    }
  }

  async function handleReconnectWallet() {
    setRecoveryAction("reconnect");
    setRecoveryToast(null);
    try {
      await disconnectWallet.mutateAsync();
      setRecoveryToast({ tone: "success", message: t("walletDisconnectedReconnect") });
    } catch {
      setRecoveryToast({ tone: "error", message: t("walletDisconnectFailedReconnect") });
    } finally {
      setRecoveryAction(null);
    }
  }

  return (
    <section className={`private-signal-unlock-card is-${cardTone}`} aria-live="polite">
      {recoveryToast ? (
        <div className={`private-signal-recovery-toast is-${recoveryToast.tone}`} role="status" aria-live="polite">
          {recoveryToast.message}
        </div>
      ) : null}
      <SealedSignalCapsule
        state={capsuleState}
        onVerify={state === "decrypted" && onHideUnlocked ? onHideUnlocked : onUnlock}
        disabled={capsuleDisabled}
        title={t("sealedSignalCapsuleTitle")}
        subtitle={t("sealedSignalCapsuleSubtitle")}
        lockedStatus={t("sealedSignalCapsuleLockedStatus")}
        verifyHint={state === "decrypted" ? t("sealedSignalCapsuleGrantedStatus") : actionLabel ?? t("sealedSignalCapsuleVerifyHint")}
        verifyingStatus={t("sealedSignalCapsuleVerifyingStatus")}
        grantedStatus={t("sealedSignalCapsuleGrantedStatus")}
        decryptedBadge={t("sealedSignalCapsuleDecryptedBadge")}
        ariaLabel={
          state === "decrypted"
            ? t("sealedSignalCapsuleReopenAria")
            : t("sealedSignalCapsuleVerifyAria")
        }
        statusMessage={resolvedStatusMessage}
        errorMessage={errorMessage}
      />

      <ol className="private-signal-unlock-steps" aria-label={t("privateSignalUnlockStatusAriaLabel")}>
        {unlockSteps.map((step) => (
          <li
            key={step.key}
            className={`${activeStep === step.key ? "is-active" : ""} ${
              step.key === "decrypted" && state === "decrypted" ? "is-complete" : ""
            } ${step.key === "failed" && (state === "failed" || state === "unauthorized") ? "is-error" : ""}`}
          >
            <span aria-hidden="true" />
            <strong>{t(step.labelKey)}</strong>
          </li>
        ))}
      </ol>

      <div className="private-signal-unlock-actions">
        {isDecrypting && onCancel ? (
          <button
            type="button"
            className="ghost-button private-signal-cancel-button"
            onClick={onCancel}
          >
            {t("cancel")}
          </button>
        ) : null}
        {children ? <div className="private-signal-unlock-side-action">{children}</div> : null}
      </div>

      {supportContent ? <div className="private-signal-unlock-note">{supportContent}</div> : null}

      {state === "failed" && errorMessage && errorMessage !== t("privateSignalUnlockError") ? (
        <p className="private-signal-unlock-detail">{errorMessage}</p>
      ) : null}

      {showRecoveryActions ? (
        <div className="private-signal-recovery-actions" aria-label={t("decryptRecoveryActionsAriaLabel")}>
          {onClearDebugCache ? (
            <button
              type="button"
              className="ghost-button"
              onClick={onClearDebugCache}
              disabled={Boolean(recoveryAction) || isDecrypting}
            >
              {t("clearCachedPolicyData")}
            </button>
          ) : null}
          <button
            type="button"
            className="danger-button"
            onClick={() => void handleResetLocalState()}
            disabled={Boolean(recoveryAction) || isDecrypting}
          >
            {recoveryAction === "reset" ? t("resettingLocalState") : t("resetLocalState")}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => void handleReconnectWallet()}
            disabled={Boolean(recoveryAction) || isDecrypting}
          >
            {recoveryAction === "reconnect" ? t("disconnectingWallet") : t("reconnectWallet")}
          </button>
          <Link className="ghost-button" to="/troubleshooting">
            {t("openTroubleshooting")}
          </Link>
        </div>
      ) : null}

      {diagnostics ? <SealPolicyDebugPanel diagnostics={diagnostics} errorMessage={errorMessage} /> : null}
    </section>
  );
}
