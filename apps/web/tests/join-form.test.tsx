import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JoinPageContent } from "../app/join/join-page-content";
import { createPublicViewerContext } from "../lib/server/public-viewer";

const visitor = createPublicViewerContext(false, "/join/ABCDEF");

describe("public guest join shell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("explains ephemeral identity and exposes a complete accessible room form", () => {
    render(<JoinPageContent initialJoinCode="ABCDEF" viewer={visitor} />);

    expect(
      screen.getByRole("heading", { level: 1, name: /room code is all you need/i }),
    ).toBeVisible();
    expect(screen.getByLabelText(/Room code/u)).toHaveValue("ABCDEF");
    expect(screen.getByLabelText(/Nickname/u)).toHaveAttribute(
      "placeholder",
      "Generated if left blank",
    );
    expect(screen.getByRole("button", { name: "Check room code" })).toBeEnabled();
    expect(screen.getByText("No pretend rooms")).toBeVisible();
    expect(
      screen.getByText(/never an email address, persistent XP, or a tracking profile/i),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/auth/sign-up?returnTo=%2Fjoin%2FABCDEF",
    );
  });

  it("reports unavailable rooms without claiming a guest joined", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "INVALID_INPUT",
          message: "That room is not available. Check the code or ask the host for a new one.",
          retryable: false,
        }),
        { headers: { "Content-Type": "application/json" }, status: 404 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<JoinPageContent viewer={visitor} />);

    await user.type(screen.getByLabelText(/Room code/u), "ABCDEF");
    await user.click(screen.getByRole("button", { name: "Check room code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That room is not available");
    expect(screen.queryByText(/you joined/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/guest/join",
      expect.objectContaining({
        body: JSON.stringify({ customNickname: "", joinCode: "ABCDEF" }),
        credentials: "same-origin",
        method: "POST",
      }),
    );
  });
});
