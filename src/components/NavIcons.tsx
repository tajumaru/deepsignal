import type { ReactNode } from "react";

interface NavItemLabelProps {
  children: ReactNode;
}

export function NavItemLabel({ children }: NavItemLabelProps) {
  return <span className="nav-item-text">{children}</span>;
}
