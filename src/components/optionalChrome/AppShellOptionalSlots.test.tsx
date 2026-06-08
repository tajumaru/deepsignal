import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DeferredNetworkMenu } from "./AppShellOptionalSlots";

const optionalHeaderWidgetSpy = vi.fn();

vi.mock("./OptionalHeaderWidget", () => ({
  OptionalHeaderWidget: (props: Record<string, unknown>) => {
    optionalHeaderWidgetSpy(props);
    return <div>Optional header widget</div>;
  },
}));

describe("DeferredNetworkMenu", () => {
  it("defers the optional header widget until the route is ready", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <DeferredNetworkMenu routeReady={false} />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Optional header widget")).not.toBeInTheDocument();
    expect(optionalHeaderWidgetSpy).not.toHaveBeenCalled();
  });
});
