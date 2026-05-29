import { buildInfo } from "../../lib/buildInfo";
import {
  subscribeToBuildUpdateNotices,
  updateDeepSignalToLatest,
  type BuildUpdateNotice,
} from "../../lib/buildUpdate";
import { useContext, useEffect, useState } from "react";
import { RpcInfrastructureContext } from "../../rpcInfrastructure";

export function BuildIndicator() {
  const rpc = useContext(RpcInfrastructureContext);
  const [notice, setNotice] = useState<BuildUpdateNotice | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => subscribeToBuildUpdateNotices(setNotice), []);

  const copyBuildInfo = () => {
    if (!navigator.clipboard) {
      return;
    }

    void navigator.clipboard.writeText(buildInfo.copyText);
  };

  const updateBuild = async () => {
    if (!notice) {
      return;
    }
    setUpdating(true);
    try {
      await updateDeepSignalToLatest(notice);
    } catch (error) {
      setUpdating(false);
      console.warn("[DeepSignal update] indicator update action failed", error);
    }
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
      {notice ? (
        <button
          className="build-indicator-update"
          type="button"
          onClick={() => void updateBuild()}
          disabled={updating}
          title={`Update DeepSignal to v${notice.latestBuild.appVersion ?? "latest"}`}
        >
          {updating ? "Updating..." : "Update"}
        </button>
      ) : null}
    </footer>
  );
}
