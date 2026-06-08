import type { ReactNode } from "react";
import { WalletNav } from "./WalletNav";
import { WalletConnectSurface } from "./WalletConnectSurface";

type WalletRuntimePanelProps =
  | {
      mode: "nav";
      onNavigate?: () => void;
      section: "access" | "inbox";
    }
  | {
      mode: "connect";
      fallback?: ReactNode;
      surface?: "mobileDrawer";
    };

export default function WalletRuntimePanel(props: WalletRuntimePanelProps) {
  if (props.mode === "nav") {
    return <WalletNav section={props.section} onNavigate={props.onNavigate} />;
  }

  return <WalletConnectSurface compact surface={props.surface} fallback={props.fallback} />;
}

export function WalletRuntimeNavSlot({
  onNavigate,
  section,
}: Extract<WalletRuntimePanelProps, { mode: "nav" }>) {
  return <WalletRuntimePanel mode="nav" section={section} onNavigate={onNavigate} />;
}

export function WalletRuntimeConnectSlot({
  fallback,
  surface,
}: Extract<WalletRuntimePanelProps, { mode: "connect" }>) {
  return <WalletRuntimePanel mode="connect" surface={surface} fallback={fallback} />;
}
