import { axe } from "jest-axe";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  Button,
  Checkbox,
  EmptyState,
  FormField,
  Input,
  Progress,
  SyncIndicator,
  ToastProvider,
  useToast,
} from "../src";

function ToastExample() {
  const { notify } = useToast();
  return (
    <Button
      onClick={() =>
        notify({
          title: "Deck saved",
          description: "Your latest edits are ready offline.",
          tone: "success",
        })
      }
    >
      Save deck
    </Button>
  );
}

describe("notifications and accessibility", () => {
  it("announces and dismisses a toast", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastExample />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Save deck" }));
    expect(screen.getByText("Deck saved")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByText("Deck saved")).not.toBeInTheDocument();
  });

  it("has no detectable axe violations in a representative component surface", async () => {
    const { container } = render(
      <main>
        <h1>Study preferences</h1>
        <FormField label="Session name" description="Visible only on this device.">
          <Input />
        </FormField>
        <Checkbox
          label="Bury related cards"
          description="Show sibling cards on a later study day."
        />
        <Progress label="Daily goal" value={7} max={10} valueLabel="7 of 10 reviews" />
        <SyncIndicator state="synced" />
        <EmptyState
          title="No saved filters"
          description="Save a useful card filter to find it here later."
        />
      </main>,
    );

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
