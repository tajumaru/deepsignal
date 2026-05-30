import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FormBuilderSteps } from "./FormBuilderSteps";

const steps = [
  { key: "template", title: "Step 1", description: "Pick a starting point" },
  { key: "info", title: "Step 2", description: "Basic info" },
];

describe("FormBuilderSteps", () => {
  it("does not select disabled steps", () => {
    const onSelect = vi.fn();

    render(
      <FormBuilderSteps
        steps={steps}
        currentStep="info"
        completedSteps={["template"]}
        disabledSteps={["template"]}
        onSelect={onSelect}
      />,
    );

    const templateStep = screen.getByRole("button", { name: /Step 1/i });

    expect(templateStep).toBeDisabled();
    fireEvent.click(templateStep);

    expect(onSelect).not.toHaveBeenCalled();
  });
});
