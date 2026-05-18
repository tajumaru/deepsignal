import type { ReactNode } from "react";

interface NavItemLabelProps {
  icon?: ReactNode;
  children: ReactNode;
}

function NavGlyph({
  children,
  className,
  viewBox = "0 0 24 24",
}: {
  children: ReactNode;
  className?: string;
  viewBox?: string;
}) {
  return (
    <span className="nav-item-icon-shell" aria-hidden="true">
      <svg viewBox={viewBox} className={className ? `nav-item-icon ${className}` : "nav-item-icon"} focusable="false">
        {children}
      </svg>
    </span>
  );
}

export function NavItemLabel({ icon, children }: NavItemLabelProps) {
  return (
    <>
      {icon}
      <span className="nav-item-text">{children}</span>
    </>
  );
}

export function CreateSignalNavIcon() {
  return (
    <NavGlyph>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
      <rect x="4.5" y="4.5" width="15" height="15" rx="4.5" />
    </NavGlyph>
  );
}

export function SignalInboxNavIcon() {
  return (
    <NavGlyph>
      <path d="M4.75 8.75h14.5v7.75a2 2 0 0 1-2 2H6.75a2 2 0 0 1-2-2Z" />
      <path d="M4.75 8.75 7.5 5.75h9l2.75 3" />
      <path d="M9 12.25h6" />
    </NavGlyph>
  );
}

export function AccessControlNavIcon() {
  return (
    <NavGlyph>
      <path d="M12 4.75 17.5 7v4.25c0 3.3-2.17 6.27-5.5 7-3.33-.73-5.5-3.7-5.5-7V7Z" />
      <path d="M10 11.25a2 2 0 1 1 4 0v1.5h-4Z" />
      <path d="M11.15 14.75h1.7" />
    </NavGlyph>
  );
}

export function MoreNavIcon() {
  return (
    <NavGlyph>
      <circle cx="6.5" cy="12" r="1.25" />
      <circle cx="12" cy="12" r="1.25" />
      <circle cx="17.5" cy="12" r="1.25" />
    </NavGlyph>
  );
}
