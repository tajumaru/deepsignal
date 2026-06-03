import type { PropsWithChildren } from "react";
import { AppShell } from "./AppShell";

export function AppShellLite({ children }: PropsWithChildren) {
  return (
    <AppShell walletAvailable={false} chrome="full">
      {children}
    </AppShell>
  );
}
