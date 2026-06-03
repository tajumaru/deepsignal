import type { ReactNode } from "react";
import { WalletConnectSurface } from "./WalletConnectSurface";
import { WalletNav } from "./WalletNav";

export function WalletRuntimeNavSlot({
  onNavigate,
  section,
}: {
  onNavigate?: () => void;
  section: "access" | "inbox";
}) {
  return <WalletNav section={section} onNavigate={onNavigate} />;
}

export function WalletRuntimeConnectSlot({
  fallback,
  surface,
}: {
  fallback?: ReactNode;
  surface?: "mobileDrawer";
}) {
  return <WalletConnectSurface compact surface={surface} fallback={fallback} />;
}
