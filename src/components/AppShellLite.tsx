import type { PropsWithChildren } from "react";
import { AppShell } from "./AppShell";

export function AppShellLite({ children }: PropsWithChildren) {
  return (
    <AppShell walletUiEnabled={false} chrome="full">
      {children}
    </AppShell>
  );
}
