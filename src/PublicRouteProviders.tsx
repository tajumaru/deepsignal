import { type PropsWithChildren, useEffect } from "react";
import { setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";

export function PublicRouteProviders({ children }: PropsWithChildren) {
  useEffect(() => {
    setDeepSignalDebugReadiness({ queryClientProvider: "ready" });
  }, []);

  return <>{children}</>;
}
