import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n";

export type PublicSignalMetaType = "contributor" | "blob" | "manifest" | "seal" | "package" | "registry";

interface PublicSignalMetaChipProps {
  type: PublicSignalMetaType;
  value: string;
  className?: string;
  interactive?: boolean;
}

interface PublicSignalMetaRowProps {
  label: string;
  type: PublicSignalMetaType;
  value?: string | null;
  emptyLabel?: string;
  children?: ReactNode;
}

const TYPE_PREFIX: Record<Exclude<PublicSignalMetaType, "contributor">, string> = {
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

function formatPublicSignalMetaValue(type: PublicSignalMetaType, rawValue: string) {
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

export function PublicSignalMetaChip({
  type,
  value,
  className = "",
  interactive = true,
}: PublicSignalMetaChipProps) {
  const { t } = useI18n();
  const [isVisible, setIsVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const label = formatPublicSignalMetaValue(type, value);

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

  const content = (
    <>
      <span className="signal-meta-chip-label">{label}</span>
      {interactive ? (
        <span className="signal-meta-chip-copy" aria-hidden="true">
          {copied ? t("copiedLabel") : t("copyLabel")}
        </span>
      ) : null}
    </>
  );

  return (
    <span className={`signal-meta-chip-shell ${className}`.trim()}>
      {interactive ? (
        <button
          type="button"
          className={`signal-meta-chip signal-meta-chip-${type}`}
          onClick={() => void handleCopy()}
          onMouseEnter={() => setIsVisible(true)}
          onMouseLeave={() => !copied && setIsVisible(false)}
          onFocus={() => setIsVisible(true)}
          onBlur={() => !copied && setIsVisible(false)}
          title={value}
          aria-label={t("copyMetadataValueAria", { value })}
        >
          {content}
        </button>
      ) : (
        <span className={`signal-meta-chip signal-meta-chip-${type}`} title={value}>
          {content}
        </span>
      )}
      {interactive && isVisible ? (
        <span className="signal-meta-tooltip" role="status" aria-live="polite">
          <span className="signal-meta-tooltip-value">{value}</span>
          {copied ? <span className="signal-meta-tooltip-copy">{t("copiedLabel")}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

export function PublicSignalMetaRow({
  label,
  type,
  value,
  emptyLabel,
  children,
}: PublicSignalMetaRowProps) {
  const { t } = useI18n();
  return (
    <div className="metadata-row signal-meta-row">
      <span>{label}</span>
      <div className="signal-meta-row-value">
        {value ? <PublicSignalMetaChip type={type} value={value} /> : <strong>{emptyLabel ?? t("notAvailable")}</strong>}
        {children}
      </div>
    </div>
  );
}
