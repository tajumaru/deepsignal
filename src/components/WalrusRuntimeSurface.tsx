import type { PropsWithChildren } from "react";
import { WalrusRuntimeProvider } from "../providers";

export function WalrusRuntimeSurface({ children }: PropsWithChildren) {
  return <WalrusRuntimeProvider>{children}</WalrusRuntimeProvider>;
}
