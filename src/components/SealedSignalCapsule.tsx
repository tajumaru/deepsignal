import { useId, type KeyboardEvent, type ReactNode } from "react";

type SealedSignalCapsuleState = "locked" | "verifying" | "granted" | "revealed" | "error";

interface SealedSignalCapsuleProps {
  state: SealedSignalCapsuleState;
  onVerify: () => void;
  disabled?: boolean;
  title: string;
  subtitle: string;
  lockedStatus: string;
  verifyHint: string;
  verifyingStatus: string;
  grantedStatus: string;
  decryptedBadge: string;
  ariaLabel: string;
  statusMessage?: string;
  errorMessage?: string;
  timestampLabel?: string;
  senderLabel?: string;
  children?: ReactNode;
}

export function SealedSignalCapsule({
  state,
  onVerify,
  disabled = false,
  title,
  subtitle,
  lockedStatus,
  verifyHint,
  verifyingStatus,
  grantedStatus,
  decryptedBadge,
  ariaLabel,
  statusMessage,
  errorMessage,
  timestampLabel,
  senderLabel,
  children,
}: SealedSignalCapsuleProps) {
  const statusId = useId();
  const isRevealed = state === "revealed";
  const isInteractive = !isRevealed && !disabled && state !== "verifying";
  const resolvedStatus =
    errorMessage ||
    statusMessage ||
    (state === "verifying" ? verifyingStatus : state === "granted" || state === "revealed" ? grantedStatus : lockedStatus);

  function handleActivate() {
    if (isInteractive) {
      onVerify();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    handleActivate();
  }

  return (
    <section
      className={`sealed-signal-capsule is-${state} ${disabled ? "is-disabled" : ""}`}
      role={isRevealed ? "region" : "button"}
      tabIndex={isRevealed || disabled ? undefined : 0}
      aria-label={ariaLabel}
      aria-disabled={!isRevealed && disabled ? true : undefined}
      aria-describedby={statusId}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
    >
      <div className="sealed-signal-capsule-grid" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="sealed-signal-capsule-header">
        <div>
          <p className="eyebrow">{title}</p>
          <h4>{title}</h4>
          <p className="muted">{subtitle}</p>
        </div>
        {isRevealed ? <span className="sealed-signal-capsule-badge">{decryptedBadge}</span> : null}
      </div>

      <div className="sealed-signal-core-stage" aria-hidden="true">
        <div className="sealed-signal-core">
          <span className="sealed-signal-core-ring sealed-signal-core-ring-outer" />
          <span className="sealed-signal-core-ring sealed-signal-core-ring-inner" />
          <span className="sealed-signal-core-orb" />
          <span className="sealed-signal-core-split sealed-signal-core-split-left" />
          <span className="sealed-signal-core-split sealed-signal-core-split-right" />
        </div>
      </div>

      <div id={statusId} className={`sealed-signal-capsule-status ${errorMessage ? "is-error" : ""}`} role={errorMessage ? "alert" : "status"}>
        <span className="sealed-signal-status-dot" aria-hidden="true" />
        <span>{resolvedStatus}</span>
      </div>

      {!isRevealed ? (
        <p className="sealed-signal-capsule-hint">{disabled ? resolvedStatus : verifyHint}</p>
      ) : (
        <div className="sealed-signal-revealed-panel">
          <div className="sealed-signal-revealed-body">{children}</div>
          {timestampLabel || senderLabel ? (
            <footer className="sealed-signal-revealed-footer">
              {timestampLabel ? <span>{timestampLabel}</span> : null}
              {senderLabel ? <span>{senderLabel}</span> : null}
            </footer>
          ) : null}
        </div>
      )}
    </section>
  );
}
