import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => navigation,
}));

import { GuideSystem, startGuideEvent } from "../components/guides/guide-system.client";

describe("interactive guide system", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      ),
    );
  });

  it("offers a non-blocking first-time choice and persists free exploration", async () => {
    const user = userEvent.setup();
    render(<GuideSystem canCreate initialProgress={null} reducedMotion />);

    expect(screen.getByRole("dialog", { name: /Make Lumen yours/i })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Explore on my own" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog", { name: /Make Lumen yours/i })).not.toBeInTheDocument();
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      guideKey: "global-tour",
      guideVersion: 1,
      status: "dismissed",
    });
  });

  it("restarts a contextual mini-guide from a stable checked-in event key", async () => {
    render(
      <>
        <div data-guide-id="mode-learn">Learn target</div>
        <GuideSystem
          canCreate
          initialProgress={{
            currentStep: 0,
            guideKey: "global-tour",
            guideVersion: 1,
            id: "0190d9f0-0000-7000-8000-000000000090",
            status: "dismissed",
          }}
          reducedMotion
        />
      </>,
    );

    window.dispatchEvent(new CustomEvent(startGuideEvent, { detail: { key: "adaptive-learn" } }));

    expect(await screen.findByRole("heading", { name: "Use adaptive Learn" })).toBeVisible();
    expect(screen.getByText(/changes question type/i)).toBeVisible();
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      guideKey: "adaptive-learn",
      status: "in_progress",
    });
  });
});
