import { CARD_SCHEMA_VERSION, generateCardBlueprints, type RichDocument } from "@lumen/domain";
import { DEFAULT_FSRS_PRESET } from "@lumen/srs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewCardView } from "@/lib/study/models";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

import { ReviewSession } from "../components/study/review-session.client";

function rich(text: string): RichDocument {
  return {
    attrs: { language: "en" },
    content: [{ content: [{ text, type: "text" }], type: "paragraph" }],
    schemaVersion: 2,
    type: "doc",
  };
}

function card(rescheduling = true): ReviewCardView {
  const renderer = generateCardBlueprints({
    back: rich("Secret answer"),
    front: rich("Visible prompt"),
    kind: "basic",
    schemaVersion: CARD_SCHEMA_VERSION,
  })[0]?.renderer;
  if (!renderer) throw new Error("Review fixture did not generate a renderer.");
  return {
    cardId: "0190d9f0-0000-7000-8000-000000000003",
    contentMismatch: false,
    deckId: "0190d9f0-0000-7000-8000-000000000004",
    deckTitle: "Biology",
    lastReviewId: null,
    noteId: "0190d9f0-0000-7000-8000-000000000010",
    position: 0,
    preset: { ...DEFAULT_FSRS_PRESET },
    renderer,
    schedule: null,
    scheduleVersion: 0,
    session: {
      completed: 0,
      id: "0190d9f0-0000-7000-8000-000000000005",
      mode: rescheduling ? "today" : "cram",
      rescheduling,
      source: rescheduling ? "today" : "cram",
      studyDayStart: 240,
      timezone: "America/Chicago",
      total: 1,
    },
    starred: false,
  };
}

describe("review session", () => {
  beforeEach(() => {
    window.localStorage.clear();
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

  it("keeps the answer out of the DOM until reveal and supports keyboard grading", async () => {
    const user = userEvent.setup();
    render(<ReviewSession card={card()} reducedMotion seriousMode />);

    expect(screen.getByText("Visible prompt")).toBeVisible();
    expect(screen.queryByText("Secret answer")).not.toBeInTheDocument();
    expect(document.querySelector(".review-session--serious")).not.toBeNull();
    expect(document.querySelector(".review-session--reduced-motion")).not.toBeNull();

    await user.keyboard(" ");
    expect(screen.getByText("Secret answer")).toBeVisible();
    expect(screen.getByRole("button", { name: /Good/ })).toBeVisible();

    await user.keyboard("3");
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(submitted.rating).toBe("good");
    expect(submitted).not.toHaveProperty("scheduleAfter");
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it("turns a swipe into a reversible selection and never an automatic grade", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ReviewSession card={card()} reducedMotion={false} seriousMode={false} />,
    );
    await user.click(screen.getByRole("checkbox", { name: "Swipe selection" }));
    await user.click(screen.getByRole("button", { name: /Show answer/ }));
    const surface = container.querySelector(".review-card");
    if (!surface) throw new Error("Review card surface is missing.");

    fireEvent.pointerDown(surface, { clientX: 10, clientY: 50 });
    fireEvent.pointerUp(surface, { clientX: 120, clientY: 50 });

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/good selected\. Swipe never grades automatically/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm good" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  });

  it("advances preview-only sessions without rendering or submitting ratings", async () => {
    const user = userEvent.setup();
    render(<ReviewSession card={card(false)} reducedMotion={false} seriousMode={false} />);

    await user.click(screen.getByRole("button", { name: /Show answer/ }));
    expect(screen.queryByRole("button", { name: /Good/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next preview" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain("/control");
  });

  it("coalesces rapid repeated grading into one canonical request", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );
    const user = userEvent.setup();
    render(<ReviewSession card={card()} reducedMotion={false} seriousMode={false} />);
    await user.click(screen.getByRole("button", { name: /Show answer/ }));

    fireEvent.keyDown(window, { key: "3" });
    fireEvent.keyDown(window, { key: "3" });
    expect(fetch).toHaveBeenCalledOnce();

    resolveRequest?.(
      new Response(JSON.stringify({ data: {} }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalled());
  });

  it("keeps a stale review visible and retries with the same idempotency identity", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "The schedule changed. Reload and retry." } }),
          {
            headers: { "content-type": "application/json" },
            status: 409,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: {} }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    const user = userEvent.setup();
    render(<ReviewSession card={card()} reducedMotion={false} seriousMode={false} />);
    await user.click(screen.getByRole("button", { name: /Show answer/ }));

    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The schedule changed");
    expect(screen.getByText("Secret answer")).toBeVisible();
    expect(screen.getByRole("button", { name: /Good/ })).toBeEnabled();
    expect(navigation.refresh).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Good/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledOnce());

    const first = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    const retry = JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    expect(retry.reviewId).toBe(first.reviewId);
    expect(retry.reviewedAt).toBe(first.reviewedAt);
  });

  it("returns every next card to an answer-hidden prompt state", async () => {
    const user = userEvent.setup();
    const first = card();
    const nextRenderer = generateCardBlueprints({
      back: rich("Second secret"),
      front: rich("Second prompt"),
      kind: "basic",
      schemaVersion: CARD_SCHEMA_VERSION,
    })[0]?.renderer;
    if (!nextRenderer) throw new Error("Second review fixture did not generate a renderer.");
    const second: ReviewCardView = {
      ...first,
      cardId: "0190d9f0-0000-7000-8000-000000000006",
      noteId: "0190d9f0-0000-7000-8000-000000000011",
      position: 1,
      renderer: nextRenderer,
      session: { ...first.session, completed: 1, total: 2 },
    };
    const { rerender } = render(
      <ReviewSession card={first} key={first.cardId} reducedMotion={false} seriousMode={false} />,
    );
    await user.click(screen.getByRole("button", { name: /Show answer/ }));
    expect(screen.getByText("Secret answer")).toBeVisible();

    rerender(
      <ReviewSession card={second} key={second.cardId} reducedMotion={false} seriousMode={false} />,
    );

    expect(screen.getByText("Second prompt")).toBeVisible();
    expect(screen.queryByText("Second secret")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show answer/ })).toBeVisible();
  });
});
