import { useEffect, useRef, useState, type ReactNode } from "react";
import { isValidSuiAddress } from "@mysten/sui/utils";
import { SuiAddressDisplay } from "./SuiAddressDisplay";

export type SignalMetaType =
  | "contributor"
  | "blob"
  | "manifest"
  | "seal"
  | "package"
  | "registry";

interface SignalMetaChipProps {
  type: SignalMetaType;
  value: string;
  className?: string;
}

interface SignalMetaRowProps {
  label: string;
  type: SignalMetaType;
  value?: string | null;
  emptyLabel?: string;
  children?: ReactNode;
}

const TYPE_PREFIX: Record<Exclude<SignalMetaType, "contributor">, string> = {
  blob: "blob",
  manifest: "mani",
  seal: "seal",
  package: "pkg",
  registry: "reg",
};

function formatContributorValue(value: string) {
  if (value.startsWith("0x")) {
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }
  if (value.startsWith("anonymous-")) {
    return `anon...${value.slice(-4)}`;
  }
  if (value.length <= 14) {
    return value;
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function formatSignalMetaValue(type: SignalMetaType, rawValue: string) {
  const value = rawValue.trim();
  if (!value) {
    return "";
  }
  if (value.length <= 14) {
    return value;
  }
  if (type === "contributor") {
    return formatContributorValue(value);
  }
  return `${TYPE_PREFIX[type]}:${value.slice(0, 6)}...${value.slice(-6)}`;
}

export function SignalMetaChip({ type, value, className = "" }: SignalMetaChipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const label = formatSignalMetaValue(type, value);
  const isSuiAddress = type === "contributor" && isValidSuiAddress(value.trim());

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
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

  if (isSuiAddress) {
    return (
      <span className={`signal-meta-chip-shell ${className}`.trim()}>
        <SuiAddressDisplay
          address={value.trim()}
          className="signal-meta-chip-sui-address"
          labelClassName="signal-meta-chip-label"
          copyClassName="signal-meta-chip-copy"
          showTooltip
        />
      </span>
    );
  }

  return (
    <span className={`signal-meta-chip-shell ${className}`.trim()}>
      <button
        type="button"
        className={`signal-meta-chip signal-meta-chip-${type}`}
        onClick={() => void handleCopy()}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => !copied && setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => !copied && setIsVisible(false)}
        title={value}
        aria-label={`メタデータ値をコピー ${value}`}
      >
        <span className="signal-meta-chip-label">{label}</span>
        <span className="signal-meta-chip-copy" aria-hidden="true">
          {copied ? "コピー済み" : "コピー"}
        </span>
      </button>
      {isVisible ? (
        <span className="signal-meta-tooltip" role="status" aria-live="polite">
          <span className="signal-meta-tooltip-value">{value}</span>
          {copied ? <span className="signal-meta-tooltip-copy">コピーしました</span> : null}
        </span>
      ) : null}
    </span>
  );
}

export function SignalMetaRow({
  label,
  type,
  value,
  emptyLabel = "利用できません",
  children,
}: SignalMetaRowProps) {
  return (
    <div className="metadata-row signal-meta-row">
      <span>{label}</span>
      <div className="signal-meta-row-value">
        {value ? <SignalMetaChip type={type} value={value} /> : <strong>{emptyLabel}</strong>}
        {children}
      </div>
    </div>
  );
}
