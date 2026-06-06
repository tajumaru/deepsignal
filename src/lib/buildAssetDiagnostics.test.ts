import { beforeEach, describe, expect, it } from "vitest";
import { getMixedBuildStatus, recordBuildAsset } from "./buildAssetDiagnostics";

const oldBuild = {
  appVersion: "0.15.16",
  buildTime: "2026.06.06-1621",
  gitHash: "hash-old",
};

const newBuild = {
  appVersion: "0.15.17",
  buildTime: "2026.06.06-1644",
  gitHash: "hash-new",
};

describe("buildAssetDiagnostics", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("drops stale observed assets when a new root build loads", () => {
    recordBuildAsset("root", oldBuild);
    recordBuildAsset("lazy:app-shell", oldBuild);

    const statusAfterNewRoot = recordBuildAsset("root", newBuild);

    expect(statusAfterNewRoot.detected).toBe(false);
    expect(statusAfterNewRoot.observed).toEqual([
      expect.objectContaining({
        source: "root",
        appVersion: newBuild.appVersion,
        buildTime: newBuild.buildTime,
        gitHash: newBuild.gitHash,
      }),
    ]);
  });

  it("still detects a real mixed-build chunk after the new root is recorded", () => {
    recordBuildAsset("root", oldBuild);
    recordBuildAsset("lazy:app-shell", oldBuild);
    recordBuildAsset("root", newBuild);

    const status = recordBuildAsset("lazy:wallet-connect", oldBuild);

    expect(status.detected).toBe(true);
    expect(status.reason).toBe("multiple_build_fingerprints");
    expect(getMixedBuildStatus().detected).toBe(true);
  });
});
