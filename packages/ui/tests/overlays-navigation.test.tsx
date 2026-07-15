import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Button, Dialog, Tabs } from "../src";

describe("overlays and navigation", () => {
  it("traps focus in a dialog and closes with Escape", async () => {
    const user = userEvent.setup();
    render(
      <Dialog
        title="Review options"
        description="Choose how this session should behave."
        trigger={<Button>Open options</Button>}
      >
        <Button>Save options</Button>
      </Dialog>,
    );

    await user.click(screen.getByRole("button", { name: "Open options" }));
    expect(screen.getByRole("dialog", { name: "Review options" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save options" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Review options" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open options" })).toHaveFocus();
  });

  it("supports arrow-key tab navigation", async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        label="Deck views"
        items={[
          { label: "Overview", value: "overview", content: <p>Deck overview</p> },
          { label: "Activity", value: "activity", content: <p>Recent activity</p> },
        ]}
      />,
    );

    const overview = screen.getByRole("tab", { name: "Overview" });
    await user.click(overview);
    await user.keyboard("{ArrowRight}");
    const activity = screen.getByRole("tab", { name: "Activity" });
    expect(activity).toHaveFocus();
    expect(activity).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Recent activity")).toBeVisible();
  });
});
