import type { PropsWithChildren } from "react";

interface EmptyStateProps extends PropsWithChildren {
  className?: string;
  variant?: "default" | "abyss";
  animated?: boolean;
  showVisual?: boolean;
}

export function EmptyState({
  children,
  className = "",
  variant = "default",
  animated = true,
  showVisual = true,
}: EmptyStateProps) {
  return (
    <div
      className={`panel empty-state ${variant === "abyss" ? "empty-state-abyss" : ""} ${!animated ? "is-static" : ""} ${className}`.trim()}
    >
      {variant === "abyss" && showVisual ? (
        <div className="abyss-empty-visual" aria-hidden="true">
          <div className="abyss-empty-grid" />
          <div className="abyss-empty-ring abyss-empty-ring-a" />
          <div className="abyss-empty-ring abyss-empty-ring-b" />
          <div className="abyss-empty-ring abyss-empty-ring-c" />
          {animated ? <div className="abyss-empty-sweep" /> : null}
          <div className="abyss-empty-core" />
          <span className={`abyss-empty-blip abyss-empty-blip-a ${!animated ? "is-static" : ""}`.trim()} />
          <span className={`abyss-empty-blip abyss-empty-blip-b ${!animated ? "is-static" : ""}`.trim()} />
        </div>
      ) : null}
      <div className="empty-state-copy">{children}</div>
    </div>
  );
}
