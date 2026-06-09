import { useEffect, useRef, type ReactNode } from "react";
import { ConnectModal as ConnectModalNext } from "@mysten/dapp-kit-react/ui";
import { compareWalletPreference, walletMatchesPreferredFeatureSet } from "../../lib/mystenDappKitCompat";

type MystenConnectModalProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
};

export function MystenConnectModal({ open = false, onOpenChange, trigger }: MystenConnectModalProps) {
  const closedOnceOpenRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      closedOnceOpenRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    const modal = containerRef.current?.querySelector("mysten-dapp-kit-connect-modal");
    if (!modal) {
      return undefined;
    }
    const handleClosed = () => {
      if (closedOnceOpenRef.current) {
        return;
      }
      closedOnceOpenRef.current = true;
      onOpenChange?.(false);
    };
    modal.addEventListener("closed", handleClosed);
    modal.addEventListener("cancel", handleClosed);
    return () => {
      modal.removeEventListener("closed", handleClosed);
      modal.removeEventListener("cancel", handleClosed);
    };
  }, [onOpenChange]);

  return (
    <div ref={containerRef}>
      {trigger}
      <ConnectModalNext
        open={open}
        filterFn={walletMatchesPreferredFeatureSet}
        sortFn={compareWalletPreference}
      />
    </div>
  );
}
