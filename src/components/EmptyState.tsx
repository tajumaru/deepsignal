import type { PropsWithChildren } from "react";

export function EmptyState({ children }: PropsWithChildren) {
  return <div className="panel empty-state">{children}</div>;
}
