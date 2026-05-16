import { useId, type ReactNode } from "react";
import type { DecryptDiagnosticContext } from "../crypto/decryptDiagnostics";
import { useI18n } from "../i18n";

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
  onCancel?: () => void;
  isDecrypting: boolean;
  isUnlocked: boolean;
  unlockState?: UnlockState;
  statusMessage?: string;
  errorMessage?: string;
  diagnostics?: DecryptDiagnosticContext | null;
  disabledReason?: string;
  actionDisabled?: boolean;
  children?: ReactNode;
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="private-signal-unlock-icon">
      <path
        d="M8 10V7.75a4 4 0 1 1 8 0V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="5"
        y="10"
        width="14"
        height="10"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 13.25a1.75 1.75 0 0 1 .75 3.33V18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OpenLockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="private-signal-unlock-icon">
      <path
        d="M9 10V7.75a4 4 0 0 1 7.08-2.56"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="5"
        y="10"
        width="14"
        height="10"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 13.25a1.75 1.75 0 0 1 .75 3.33V18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="private-signal-action-icon private-signal-spinner">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeOpacity="0.24" strokeWidth="2" />
      <path
        d="M20.5 12A8.5 8.5 0 0 0 12 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="private-signal-action-icon">
      <path
        d="M12 4.5 20 18.5H4L12 4.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 9v4.75" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="16.8" r="1" fill="currentColor" />
    </svg>
  );
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

function SealPolicyDebugPanel({ diagnostics }: { diagnostics: DecryptDiagnosticContext }) {
  const rows = [
    ["Policy hash", diagnostics.policyHash ?? diagnostics.decryptPolicySnapshot?.policyHash],
    ["Package ID", diagnostics.packageId ?? diagnostics.decryptPolicySnapshot?.packageId],
    ["Capability type", diagnostics.capabilityType ?? diagnostics.decryptPolicySnapshot?.capabilityType],
    ["Object ID", diagnostics.accessObjectId ?? diagnostics.decryptPolicySnapshot?.objectId],
    ["Policy object ID", diagnostics.policyObjectId ?? diagnostics.decryptPolicySnapshot?.policyObjectId],
    ["Wallet address", diagnostics.walletAddress ?? diagnostics.decryptPolicySnapshot?.walletAddress],
    ["Policy match", diagnostics.policySnapshotComparison?.matches],
    ["Policy diff", diagnostics.policySnapshotComparison?.differingKeys.join(", ")],
  ] as const;

  return (
    <details className="seal-policy-debug-panel" open={Boolean(diagnostics.policySnapshotComparison && !diagnostics.policySnapshotComparison.matches)}>
      <summary>Seal policy debug</summary>
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
          <strong>Required capability objects</strong>
          <pre>{formatDebugValue(diagnostics.requiredCapabilityObjects)}</pre>
        </div>
        <div>
          <strong>Owned capability objects</strong>
          <pre>{formatDebugValue(diagnostics.ownedCapabilityObjects)}</pre>
        </div>
      </div>
      <div className="seal-policy-debug-grid">
        <div>
          <strong>Encrypt policy JSON</strong>
          <pre>{formatDebugValue(diagnostics.encryptPolicySnapshot?.normalizedPolicyJson)}</pre>
        </div>
        <div>
          <strong>Decrypt policy JSON</strong>
          <pre>{formatDebugValue(diagnostics.normalizedPolicyJson ?? diagnostics.decryptPolicySnapshot?.normalizedPolicyJson)}</pre>
        </div>
      </div>
    </details>
  );
}

const unlockSteps: Array<{ key: "locked" | "waiting_wallet_approval" | "decrypting" | "decrypted" | "failed"; label: string }> = [
  { key: "locked", label: "Locked" },
  { key: "waiting_wallet_approval", label: "Waiting wallet approval" },
  { key: "decrypting", label: "Decrypting" },
  { key: "decrypted", label: "Unlocked" },
  { key: "failed", label: "Failed" },
];

export function PrivateSignalUnlockCard({
  onUnlock,
  onCancel,
  isDecrypting,
  isUnlocked,
  unlockState,
  statusMessage,
  errorMessage,
  diagnostics,
  disabledReason,
  actionDisabled = false,
  children,
}: PrivateSignalUnlockCardProps) {
  const { t } = useI18n();
  const statusId = useId();
  const state = isUnlocked
    ? "decrypted"
    : (unlockState ?? (isDecrypting ? "decrypting" : errorMessage ? "failed" : "locked"));
  const buttonDisabled = actionDisabled || isDecrypting || state === "decrypted";
  const helperText = isUnlocked
    ? t("privateSignalUnlockSuccessDetail")
    : state === "unauthorized"
      ? "This wallet can see the signal exists, but it is not authorized to decrypt it."
      : t("privateSignalUnlockHelper");
  const resolvedStatusMessage =
    errorMessage ||
    statusMessage ||
    disabledReason ||
    (state === "locked" ? "Signal remains locked." : undefined);
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

  return (
    <section className={`private-signal-unlock-card is-${cardTone}`} aria-live="polite">
      <div className="private-signal-vault-visual" aria-hidden="true">
        <div className="private-signal-vault-lock">
          {state === "decrypted" ? <OpenLockIcon /> : <LockIcon />}
        </div>
        <div className="private-signal-vault-grid">
          {Array.from({ length: 18 }).map((_, index) => (
            <span key={index} />
          ))}
        </div>
      </div>
      <div className="private-signal-unlock-header">
        {state === "decrypted" ? null : (
          <div className="private-signal-unlock-badge">
            <LockIcon />
          </div>
        )}
        <div className="private-signal-unlock-copy">
          <p className="eyebrow">{t("privateSignalLockedEyebrow")}</p>
          <h4>{isUnlocked ? t("privateSignalUnlockedTitle") : t("privateSignalLockedTitle")}</h4>
          <p className="muted">{helperText}</p>
        </div>
      </div>

      <ol className="private-signal-unlock-steps" aria-label="Private signal unlock status">
        {unlockSteps.map((step) => (
          <li
            key={step.key}
            className={`${activeStep === step.key ? "is-active" : ""} ${
              step.key === "decrypted" && state === "decrypted" ? "is-complete" : ""
            } ${step.key === "failed" && (state === "failed" || state === "unauthorized") ? "is-error" : ""}`}
          >
            <span aria-hidden="true" />
            <strong>{step.label}</strong>
          </li>
        ))}
      </ol>

      <div className="private-signal-unlock-actions">
        <button
          type="button"
          className="private-signal-unlock-button"
          onClick={onUnlock}
          disabled={buttonDisabled}
          aria-describedby={resolvedStatusMessage ? statusId : undefined}
        >
          {isDecrypting ? <SpinnerIcon /> : null}
          {!isDecrypting && state !== "decrypted" ? <LockIcon /> : null}
          <span>
            {isDecrypting
              ? t("privateSignalUnlockLoading")
              : state === "decrypted"
                ? t("privateSignalUnlockSuccess")
                : state === "unauthorized"
                  ? "Access denied"
                : t("privateSignalUnlockAction")}
          </span>
        </button>
        {isDecrypting && onCancel ? (
          <button
            type="button"
            className="ghost-button private-signal-cancel-button"
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : null}
        {children ? <div className="private-signal-unlock-side-action">{children}</div> : null}
      </div>

      {resolvedStatusMessage ? (
        <div
          id={statusId}
          className={`private-signal-unlock-status is-${state === "unauthorized" || state === "failed" ? "error" : "muted"}`}
          role={state === "unauthorized" || state === "failed" ? "alert" : "status"}
        >
          {state === "unauthorized" || state === "failed" ? <WarningIcon /> : null}
          <span>{resolvedStatusMessage}</span>
        </div>
      ) : null}

      {state === "failed" && errorMessage && errorMessage !== t("privateSignalUnlockError") ? (
        <p className="private-signal-unlock-detail">{errorMessage}</p>
      ) : null}

      {diagnostics ? <SealPolicyDebugPanel diagnostics={diagnostics} /> : null}
    </section>
  );
}
