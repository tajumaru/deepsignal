import { useEffect, useRef, useState } from "react";
import { useSuiName } from "../hooks/useSuiName";
import { shortAddress } from "../lib/sui";

interface SuiAddressDisplayProps {
  address: string;
  className?: string;
  labelClassName?: string;
  copyClassName?: string;
  showCopyLabel?: boolean;
  showTooltip?: boolean;
  copiedLabel?: string;
  copyLabel?: string;
  copyOnClick?: boolean;
  onPress?: () => void;
  resolveName?: boolean;
  interactive?: boolean;
}

export function SuiAddressDisplay({
  address,
  className = "",
  labelClassName = "",
  copyClassName = "",
  showCopyLabel = true,
  showTooltip = false,
  copiedLabel = "Address copied",
  copyLabel = "Copy",
  copyOnClick = true,
  onPress,
  resolveName = true,
  interactive = true,
}: SuiAddressDisplayProps) {
  const { data: suinsName } = useSuiName(address, { enabled: resolveName });
  const [isVisible, setIsVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const displayLabel = suinsName ?? shortAddress(address);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    if (!copyOnClick) {
      onPress?.();
      return;
    }

    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setIsVisible(true);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        setIsVisible(false);
      }, 1800);
    } catch (error) {
      console.error(error);
    }
  }

  const content = (
    <>
      <span className={`sui-address-display-label ${labelClassName}`.trim()}>{displayLabel}</span>
      {showCopyLabel ? (
        <span className={`sui-address-display-copy ${copyClassName}`.trim()} aria-hidden="true">
          {copyLabel}
        </span>
      ) : null}
    </>
  );

  return (
    <span className={`sui-address-display-shell ${className}`.trim()}>
      {interactive ? (
        <button
          type="button"
          className="sui-address-display"
          onClick={() => void handleCopy()}
          onMouseEnter={() => showTooltip && setIsVisible(true)}
          onMouseLeave={() => showTooltip && !copied && setIsVisible(false)}
          onFocus={() => showTooltip && setIsVisible(true)}
          onBlur={() => showTooltip && !copied && setIsVisible(false)}
          title={address}
          aria-label={`Copy wallet address ${address}`}
        >
          {content}
        </button>
      ) : (
        <span className="sui-address-display" title={address}>
          {content}
        </span>
      )}
      {showTooltip && isVisible ? (
        <span className="signal-meta-tooltip" role="status" aria-live="polite">
          <span className="signal-meta-tooltip-value">{shortAddress(address)}</span>
          {copied ? <span className="signal-meta-tooltip-copy">{copiedLabel}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
