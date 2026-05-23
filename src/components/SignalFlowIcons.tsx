import type { ReactNode } from "react";
import type { SignalPipelineStage } from "../features/public-form/hooks/usePublicSubmission";

export type FlowStepIconName = "Submit" | "Encrypt" | "Store" | "Review" | "Certify";

function SignalGlyph({
  children,
  className,
  viewBox = "0 0 24 24",
}: {
  children: ReactNode;
  className?: string;
  viewBox?: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      className={className ? `signal-flow-icon ${className}` : "signal-flow-icon"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function FlowStepIcon({ name }: { name: FlowStepIconName }) {
  switch (name) {
    case "Submit":
      return (
        <SignalGlyph>
          <path d="M12 4.75v9.5" />
          <path d="m8.5 10.75 3.5 3.5 3.5-3.5" />
          <path d="M5.75 18.25h12.5" />
          <path d="M7.25 18.25v1h9.5v-1" />
        </SignalGlyph>
      );
    case "Encrypt":
      return (
        <SignalGlyph>
          <rect x="6.25" y="10.25" width="11.5" height="8.5" rx="2.25" />
          <path d="M8.75 10.25V8.5a3.25 3.25 0 0 1 6.5 0v1.75" />
          <path d="M12 13.6v1.8" />
        </SignalGlyph>
      );
    case "Store":
      return (
        <SignalGlyph>
          <path d="m12 4.75 6.25 3.5V15.75L12 19.25 5.75 15.75V8.25Z" />
          <path d="m12 4.75 6.25 3.5L12 11.75l-6.25-3.5" />
          <path d="M12 11.75v7.5" />
        </SignalGlyph>
      );
    case "Review":
      return (
        <SignalGlyph>
          <circle cx="9" cy="9.25" r="2.25" />
          <path d="M5.75 17.5a3.8 3.8 0 0 1 6.5-2.7" />
          <circle cx="16.4" cy="15.4" r="1.75" />
          <path d="m17.75 16.75 1.9 1.9" />
          <path d="M13.5 7.9a2.1 2.1 0 0 1 3.45 1.62" />
        </SignalGlyph>
      );
    case "Certify":
      return (
        <SignalGlyph>
          <path d="M12 4.5 17.6 6.9v4.4c0 3.45-2.2 6.58-5.6 7.45-3.4-.87-5.6-4-5.6-7.45V6.9Z" />
          <path d="m9.25 12.25 1.8 1.85 3.7-3.8" />
          <path d="M16.8 8.2h2.45M18.02 6.98v2.45" />
        </SignalGlyph>
      );
  }
}

export function PipelineStageIcon({ stage }: { stage: SignalPipelineStage }) {
  switch (stage) {
    case "preparing_signal":
      return <FlowStepIcon name="Submit" />;
    case "encrypting":
      return <FlowStepIcon name="Encrypt" />;
    case "uploading_to_walrus":
      return <FlowStepIcon name="Store" />;
    case "confirming_blob":
      return (
        <SignalGlyph>
          <circle cx="12" cy="12" r="7.25" />
          <path d="m8.75 12.1 2.1 2.15 4.4-4.5" />
        </SignalGlyph>
      );
    case "generating_manifest":
      return (
        <SignalGlyph>
          <path d="M7.25 5.25h6.8l2.7 2.7v10.8a1.5 1.5 0 0 1-1.5 1.5h-8a1.5 1.5 0 0 1-1.5-1.5v-12a1.5 1.5 0 0 1 1.5-1.5Z" />
          <path d="M13.95 5.25v3h2.8" />
          <path d="M8.75 11.1h6.5M8.75 14.25h6.5" />
        </SignalGlyph>
      );
    case "signal_secured":
      return (
        <SignalGlyph>
          <path d="M12 4.5 17.6 6.9v4.4c0 3.45-2.2 6.58-5.6 7.45-3.4-.87-5.6-4-5.6-7.45V6.9Z" />
          <path d="m9.25 12.25 1.8 1.85 3.7-3.8" />
        </SignalGlyph>
      );
  }
}
