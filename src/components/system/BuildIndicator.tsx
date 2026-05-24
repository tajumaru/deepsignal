import { buildInfo } from "../../lib/buildInfo";
import { useContext } from "react";
import { RpcInfrastructureContext } from "../../rpcInfrastructure";

export function BuildIndicator() {
  const rpc = useContext(RpcInfrastructureContext);
  const copyBuildInfo = () => {
    if (!navigator.clipboard) {
      return;
    }

    void navigator.clipboard.writeText(buildInfo.copyText);
  };

  return (
    <footer className="build-indicator" aria-label="Build information">
      <span className="build-indicator-attribution">
        {rpc?.usingTatum ? "Powered by Walrus, Seal, Sui, and Tatum RPC" : "Powered by Walrus, Seal, and Sui RPC"}
      </span>
      <button
        className="build-indicator-button"
        type="button"
        onClick={copyBuildInfo}
        title="Copy build info"
      >
        {buildInfo.label}
      </button>
    </footer>
  );
}
