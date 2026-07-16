import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button, IconButton, LinkButton } from "../src";

describe("buttons", () => {
  it("prevents duplicate actions while loading and announces its state", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading loadingLabel="Saving card" onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Saving card" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("requires an accessible label for an icon-only action", () => {
    render(
      <IconButton label="Shuffle cards">
        <span>↻</span>
      </IconButton>,
    );
    expect(screen.getByRole("button", { name: "Shuffle cards" })).toBeVisible();
  });

  it("allows long labels to wrap safely while remaining centered", () => {
    render(<Button>Continue with a deliberately long translated action label</Button>);

    const button = screen.getByRole("button", {
      name: "Continue with a deliberately long translated action label",
    });
    expect(button).toHaveClass("max-w-full", "min-w-0", "text-center", "whitespace-normal");
    expect(button).not.toHaveClass("whitespace-nowrap");
    expect(button.firstElementChild).toHaveClass(
      "min-w-0",
      "text-center",
      "[overflow-wrap:anywhere]",
    );
  });

  it("removes disabled links from keyboard navigation", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <LinkButton href="/study" disabled onClick={onClick}>
        Start study
      </LinkButton>,
    );

    const link = screen.getByRole("link", { name: "Start study" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAttribute("tabindex", "-1");
    await user.click(link);
    expect(onClick).not.toHaveBeenCalled();
  });
});
