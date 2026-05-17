import type { ReactNode } from "react";
import type { SignalCategory } from "../lib/signalInbox";
import type { Submission } from "../types";

type BadgeTone =
  | "unread"
  | "priority-low"
  | "priority-medium"
  | "priority-high"
  | "bug"
  | "feature"
  | "survey"
  | "praise"
  | "general"
  | "unknown"
  | "pending"
  | "selected"
  | "attachment"
  | "new"
  | "encrypted"
  | "cluster"
  | "local";

interface BadgeIconProps {
  className?: string;
}

interface BadgeDescriptor {
  key: string;
  tone: BadgeTone;
  label: string;
  title: string;
  Icon: (props: BadgeIconProps) => ReactNode;
}

interface SignalStatusBadgesProps {
  submission: Submission;
  category: SignalCategory | string;
  pendingSui?: boolean;
  selectedForSui?: boolean;
  showEncrypted?: boolean;
  storageLabel?: string;
  className?: string;
  density?: "full" | "notable";
}

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function IconBase({
  children,
  className,
  viewBox = "0 0 24 24",
}: {
  children: ReactNode;
  className?: string;
  viewBox?: string;
}) {
  return (
    <svg viewBox={viewBox} aria-hidden="true" className={joinClassNames("signal-status-icon", className)}>
      {children}
    </svg>
  );
}

function MailIcon({ className }: BadgeIconProps) {
  return (
    <IconBase className={className}>
      <path
        d="M4.5 7.5h15a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15V9a1.5 1.5 0 0 1 1.5-1.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m5.5 9 6.5 5 6.5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

function ActivityIcon({ className }: BadgeIconProps) {
  return (
    <IconBase className={className}>
      <path
        d="M4 14h3l2.2-4.5 4.1 8L16 12h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

function BugIcon({ className }: BadgeIconProps) {
  return (
    <IconBase className={className}>
      <path
        d="M9 7.5a3 3 0 0 1 6 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect
        x="7"
        y="7.5"
        width="10"
        height="9"
        rx="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 10.5v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M5 9.5h2M17 9.5h2M5 14.5h2M17 14.5h2M8 5 6.5 3.5M16 5l1.5-1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </IconBase>
  );
}

function ClockIcon({ className }: BadgeIconProps) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 7.8v4.5l3 1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

function PaperclipIcon({ className }: BadgeIconProps) {
  return (
    <IconBase className={className}>
      <path
        d="m9.5 12.5 4.8-4.8a2.75 2.75 0 1 1 3.9 3.9l-6.7 6.7a4.25 4.25 0 1 1-6-6l6.8-6.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

function SparklesIcon({ className }: BadgeIconProps) {
  return (
    <IconBase className={className}>
      <path
        d="m12 4 1.25 3.75L17 9l-3.75 1.25L12 14l-1.25-3.75L7 9l3.75-1.25L12 4ZM18 14l.75 2.25L21 17l-2.25.75L18 20l-.75-2.25L15 17l2.25-.75L18 14ZM6 13l.85 2.15L9 16l-2.15.85L6 19l-.85-2.15L3 16l2.15-.85L6 13Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

function LayersIcon({ className }: BadgeIconProps) {
  return (
    <IconBase className={className}>
      <path
        d="m12 5 8 4.5-8 4.5-8-4.5L12 5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m4 14 8 4.5 8-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

function RocketIcon({ className }: BadgeIconProps) {
  return (
    <IconBase className={className}>
      <path
        d="M14.5 5.5c2.3-.3 4.5.9 4.5.9s1.2 2.2.9 4.5c-.2 1.6-1 3.1-2.1 4.3l-1.8 1.8-5.5-5.5 1.8-1.8c1.2-1.1 2.7-1.9 4.3-2.1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m9.5 14.5-2.8 2.8a2.4 2.4 0 1 1-3.4-3.4l2.8-2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" />
    </IconBase>
  );
}

function HeartIcon({ className }: BadgeIconProps) {
  return (
    <IconBase className={className}>
      <path
        d="M12 19s-6.5-3.9-6.5-8.8A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 6.5 2.2C18.5 15.1 12 19 12 19Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

function DotIcon({ className }: BadgeIconProps) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="4" fill="currentColor" />
    </IconBase>
  );
}

function CheckIcon({ className }: BadgeIconProps) {
  return (
    <IconBase className={className}>
      <path
        d="m6.5 12.5 3.3 3.3 7.7-7.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

function LockIcon({ className }: BadgeIconProps) {
  return (
    <IconBase className={className}>
      <path
        d="M8.5 10V8.1a3.5 3.5 0 1 1 7 0V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect
        x="6.5"
        y="10"
        width="11"
        height="8.5"
        rx="2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </IconBase>
  );
}

function CpuIcon({ className }: BadgeIconProps) {
  return (
    <IconBase className={className}>
      <rect
        x="7.5"
        y="7.5"
        width="9"
        height="9"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M10.5 10.5h3v3h-3zM9 3.5v2M15 3.5v2M9 18.5v2M15 18.5v2M18.5 9h2M18.5 15h2M3.5 9h2M3.5 15h2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

function HardDriveIcon({ className }: BadgeIconProps) {
  return (
    <IconBase className={className}>
      <rect
        x="4"
        y="6.5"
        width="16"
        height="11"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M7.5 14.5h.01M11.5 14.5h.01M4.5 11.5h15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </IconBase>
  );
}

function getPriorityBadge(priority: Submission["priority"]): BadgeDescriptor {
  const tone: Record<Submission["priority"], BadgeTone> = {
    low: "priority-low",
    medium: "priority-medium",
    high: "priority-high",
  };
  const label: Record<Submission["priority"], string> = {
    low: "L",
    medium: "M",
    high: "H",
  };
  const title: Record<Submission["priority"], string> = {
    low: "Low priority",
    medium: "Medium priority",
    high: "High priority",
  };
  return {
    key: `priority-${priority}`,
    tone: tone[priority],
    label: label[priority],
    title: title[priority],
    Icon: ActivityIcon,
  };
}

function getCategoryBadge(category: SignalCategory | string): BadgeDescriptor {
  switch (category) {
    case "Bug":
      return { key: "category-bug", tone: "bug", label: "Bug", title: "Bug report", Icon: BugIcon };
    case "Feature":
      return { key: "category-feature", tone: "feature", label: "Feat", title: "Feature request", Icon: RocketIcon };
    case "Survey":
      return { key: "category-survey", tone: "survey", label: "Form", title: "Survey response", Icon: LayersIcon };
    case "Praise":
      return { key: "category-praise", tone: "praise", label: "Love", title: "Positive feedback", Icon: HeartIcon };
    case "General":
      return { key: "category-general", tone: "general", label: "Gen", title: "General signal", Icon: DotIcon };
    default:
      return { key: "category-unknown", tone: "unknown", label: "?", title: "Unknown signal type", Icon: DotIcon };
  }
}

export function SignalStatusBadges({
  submission,
  category,
  pendingSui = false,
  selectedForSui = false,
  showEncrypted = false,
  storageLabel,
  className,
  density = "full",
}: SignalStatusBadgesProps) {
  const badges: BadgeDescriptor[] = [];
  const showFullSet = density === "full";

  if (showFullSet && submission.status === "unread") {
    badges.push({
      key: "unread",
      tone: "unread",
      label: "1",
      title: "Unread signal",
      Icon: MailIcon,
    });
  }

  if (showFullSet) {
    badges.push(getPriorityBadge(submission.priority));
    badges.push(getCategoryBadge(category));
  }

  if (pendingSui) {
    badges.push({
      key: "pending-sui",
      tone: "pending",
      label: "Sui",
      title: "Pending Sui registration",
      Icon: ClockIcon,
    });
  }

  if (selectedForSui) {
    badges.push({
      key: "selected-sui",
      tone: "selected",
      label: "Pick",
      title: "Selected for Sui registration",
      Icon: CheckIcon,
    });
  }

  if (submission.clusterId) {
    badges.push({
      key: "clustered",
      tone: "cluster",
      label: "AI",
      title: "AI grouped signal",
      Icon: CpuIcon,
    });
  }

  if (submission.attachments.length > 0) {
    badges.push({
      key: "attachments",
      tone: "attachment",
      label: String(submission.attachments.length),
      title: `${submission.attachments.length} attachment${submission.attachments.length === 1 ? "" : "s"}`,
      Icon: PaperclipIcon,
    });
  }

  if (showFullSet && showEncrypted && submission.isEncrypted) {
    badges.push({
      key: "encrypted",
      tone: "encrypted",
      label: "Seal",
      title: "Encrypted private signal",
      Icon: LockIcon,
    });
  }

  if (showFullSet && submission.status === "unread") {
    badges.push({
      key: "new",
      tone: "new",
      label: "New",
      title: "New signal",
      Icon: SparklesIcon,
    });
  }

  if (storageLabel === "Stored locally only") {
    badges.push({
      key: "local-only",
      tone: "local",
      label: "Local",
      title: "Stored locally only",
      Icon: HardDriveIcon,
    });
  }

  if (badges.length === 0) {
    return null;
  }

  return (
    <div className={joinClassNames("signal-status-badges", className)}>
      {badges.map(({ key, tone, label, title, Icon }) => (
        <span
          key={key}
          className={`signal-status-chip is-${tone}`}
          title={title}
          aria-label={title}
        >
          <span className="signal-status-chip-icon-shell">
            <Icon />
          </span>
          <span className="signal-status-chip-label">{label}</span>
        </span>
      ))}
    </div>
  );
}
