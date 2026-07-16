import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isolateBrowserLearnerContext: vi.fn(),
  replaceWithActiveLearnerDocument: vi.fn(),
}));

vi.mock("@/lib/auth/cache-isolation.client", () => ({
  isolateBrowserLearnerContext: mocks.isolateBrowserLearnerContext,
  replaceWithActiveLearnerDocument: mocks.replaceWithActiveLearnerDocument,
}));

import { ProfileSwitchAction } from "../components/settings/learner-card-actions.client";

describe("managed learner profile switch boundary", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({}),
        ok: true,
      }),
    );
    mocks.isolateBrowserLearnerContext.mockRejectedValue(new Error("cache unavailable"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replaces the guardian document when cleanup rejects after the server switch succeeds", async () => {
    const user = userEvent.setup();
    render(<ProfileSwitchAction learnerProfileId="22222222-2222-4222-8222-222222222222" />);

    await user.type(screen.getByRole("textbox", { name: "Family code" }), "ABCDEFGH23456789");
    await user.type(screen.getByLabelText(/^PIN/u), "246810");
    await user.click(screen.getByRole("button", { name: "Open profile" }));

    await waitFor(() => {
      expect(mocks.replaceWithActiveLearnerDocument).toHaveBeenCalledOnce();
    });
    expect(mocks.isolateBrowserLearnerContext).toHaveBeenCalledWith("learner_profile_switched");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
