import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { FormField, Input, Radio, Switch } from "../src";

describe("form controls", () => {
  it("connects labels, descriptions, required state, and errors", () => {
    render(
      <FormField
        label="Deck title"
        description="Use a name you will recognize later."
        error="Enter a title."
        required
      >
        <Input />
      </FormField>,
    );

    const input = screen.getByRole("textbox", { name: /deck title/i });
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(describedBy.split(" ")).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a title.");
  });

  it("toggles a switch with the keyboard", async () => {
    const user = userEvent.setup();
    function Example() {
      const [checked, setChecked] = useState(false);
      return <Switch label="Serious mode" checked={checked} onCheckedChange={setChecked} />;
    }
    render(<Example />);

    const control = screen.getByRole("switch", { name: "Serious mode" });
    await user.tab();
    expect(control).toHaveFocus();
    await user.keyboard(" ");
    expect(control).toBeChecked();
  });

  it("moves through radio choices using arrow keys", async () => {
    const user = userEvent.setup();
    render(
      <FormField label="Study pace" group>
        <Radio
          defaultValue="steady"
          options={[
            { label: "Steady", value: "steady" },
            { label: "Focused", value: "focused" },
          ]}
        />
      </FormField>,
    );

    const steady = screen.getByRole("radio", { name: "Steady" });
    const focused = screen.getByRole("radio", { name: "Focused" });
    steady.focus();
    await user.keyboard("{ArrowRight}");
    expect(focused).toHaveFocus();
    await user.keyboard(" ");
    expect(focused).toBeChecked();
  });
});
