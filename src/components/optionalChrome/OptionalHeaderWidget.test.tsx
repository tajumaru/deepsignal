import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OptionalHeaderWidget } from "./OptionalHeaderWidget";

function HeaderWidgetBody() {
  return <div>Wallet widget runtime</div>;
}

describe("OptionalHeaderWidget", () => {
  it("renders fallback instead of crashing when the wallet widget import is rejected in smoke mode", async () => {
    const windowWithSmoke = window as Window & {
      __DEEPSIGNAL_SMOKE__?: {
        rejectWalletUiImport?: boolean;
      };
    };
    windowWithSmoke.__DEEPSIGNAL_SMOKE__ = {
      rejectWalletUiImport: true,
    };

    render(
      <OptionalHeaderWidget
        fallback={<div>Wallet widget unavailable</div>}
        label="wallet-runtime-connect-surface"
        loader={async () => ({ default: HeaderWidgetBody })}
        resetKey="wallet-runtime-connect-surface:0"
      />,
    );

    expect(await screen.findByText("Wallet widget unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Wallet widget runtime")).not.toBeInTheDocument();

    delete windowWithSmoke.__DEEPSIGNAL_SMOKE__;
  });
});
