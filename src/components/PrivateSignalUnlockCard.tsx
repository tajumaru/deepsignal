import { useId, type ReactNode } from "react";
import { useI18n } from "../i18n";

type UnlockState = "idle" | "loading" | "success" | "error";

interface PrivateSignalUnlockCardProps {
  onUnlock: () => void;
  isDecrypting: boolean;
  isUnlocked: boolean;
  errorMessage?: string;
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

function getUnlockState(isDecrypting: boolean, isUnlocked: boolean, errorMessage?: string): UnlockState {
  if (isDecrypting) {
    return "loading";
  }
  if (isUnlocked) {
    return "success";
  }
  if (errorMessage) {
    return "error";
  }
  return "idle";
}

export function PrivateSignalUnlockCard({
  onUnlock,
  isDecrypting,
  isUnlocked,
  errorMessage,
  disabledReason,
  actionDisabled = false,
  children,
}: PrivateSignalUnlockCardProps) {
  const { t } = useI18n();
  const statusId = useId();
  const state = getUnlockState(isDecrypting, isUnlocked, errorMessage);
  const buttonDisabled = actionDisabled || state === "loading" || state === "success";
  const helperText = isUnlocked
    ? t("privateSignalUnlockSuccessDetail")
    : t("privateSignalUnlockHelper");
  const statusMessage =
    state === "error"
      ? t("privateSignalUnlockError")
      : disabledReason;

  return (
    <section className={`private-signal-unlock-card is-${state}`} aria-live="polite">
      <div className="private-signal-vault-visual" aria-hidden="true">
        <div className="private-signal-vault-lock">
          {state === "success" ? <OpenLockIcon /> : <LockIcon />}
        </div>
        <div className="private-signal-vault-grid">
          {Array.from({ length: 18 }).map((_, index) => (
            <span key={index} />
          ))}
        </div>
      </div>
      <div className="private-signal-unlock-header">
        {state === "success" ? null : (
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

      <div className="private-signal-unlock-actions">
        <button
          type="button"
          className="private-signal-unlock-button"
          onClick={onUnlock}
          disabled={buttonDisabled}
          aria-describedby={statusMessage ? statusId : undefined}
        >
          {state === "loading" ? <SpinnerIcon /> : null}
          {state === "error" || state === "idle" ? <LockIcon /> : null}
          <span>
            {state === "loading"
              ? t("privateSignalUnlockLoading")
              : state === "success"
                ? t("privateSignalUnlockSuccess")
                : t("privateSignalUnlockAction")}
          </span>
        </button>
        {children ? <div className="private-signal-unlock-side-action">{children}</div> : null}
      </div>

      {statusMessage ? (
        <div
          id={statusId}
          className={`private-signal-unlock-status is-${state === "error" ? "error" : "muted"}`}
          role={state === "error" ? "alert" : "status"}
        >
          {state === "error" ? <WarningIcon /> : null}
          <span>{statusMessage}</span>
        </div>
      ) : null}

      {state === "error" && errorMessage && errorMessage !== t("privateSignalUnlockError") ? (
        <p className="private-signal-unlock-detail">{errorMessage}</p>
      ) : null}
    </section>
  );
}
