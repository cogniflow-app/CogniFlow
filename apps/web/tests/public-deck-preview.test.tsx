import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CARD_SCHEMA_VERSION, generateCardBlueprints } from "@lumen/domain";

import {
  PublicDeckAttribution,
  PublicDeckPreview,
} from "../components/content/public-deck-preview.client";
import { publicDeck } from "./fixtures/content";

describe("public deck preview", () => {
  it("flips and traverses a frozen public projection without implying study progress", async () => {
    const user = userEvent.setup();
    render(<PublicDeckPreview deck={publicDeck} />);

    expect(screen.getAllByText("1 of 2")[0]).toBeVisible();
    const card = screen.getByRole("region", { name: "Prompt card preview" });
    expect(card.closest(".public-preview")).toHaveAttribute("data-deck-theme", "ocean");
    expect(card).toHaveTextContent("What is ATP?");
    expect(screen.getByRole("button", { name: /Previous/i })).toBeDisabled();
    expect(
      screen.getByText(/does not create learner progress, history, scheduling state/i),
    ).toBeVisible();

    await user.click(screen.getAllByRole("button", { name: "Reveal answer" })[0]!);
    expect(screen.getByRole("region", { name: "Answer card preview" })).toHaveTextContent(
      "The cell's usable energy carrier",
    );

    await user.click(screen.getByRole("button", { name: /Next/i }));
    expect(screen.getAllByText("2 of 2")[0]).toBeVisible();
    expect(screen.getByRole("region", { name: /Prompt card preview/i })).toHaveTextContent(
      "Which organelle produces most ATP?",
    );
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });

  it.each(["neutral", "ocean", "forest", "contrast"] as const)(
    "applies the frozen %s deck theme to the rendered preview",
    (theme) => {
      const { container } = render(<PublicDeckPreview deck={{ ...publicDeck, theme }} />);

      expect(container.querySelector(".public-preview")).toHaveAttribute("data-deck-theme", theme);
    },
  );

  it("supports the documented keyboard flip and navigation controls", () => {
    render(<PublicDeckPreview deck={publicDeck} />);

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
    expect(screen.getAllByText("2 of 2")[0]).toBeVisible();
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: " " })));
    expect(screen.getByRole("region", { name: /Answer card preview/i })).toHaveTextContent(
      "Mitochondrion",
    );
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" })));
    expect(screen.getAllByText("1 of 2")[0]).toBeVisible();
    expect(screen.getByRole("region", { name: /Prompt card preview/i })).toHaveTextContent(
      "What is ATP?",
    );
  });

  it("flips on click and supports touch swipe navigation", async () => {
    const user = userEvent.setup();
    render(<PublicDeckPreview deck={publicDeck} />);

    await user.click(screen.getByRole("button", { name: /Prompt card preview/i }));
    expect(screen.getByRole("region", { name: /Answer card preview/i })).toHaveTextContent(
      "The cell's usable energy carrier",
    );

    fireEvent.touchStart(screen.getByRole("button", { name: /Answer card preview/i }), {
      changedTouches: [{ clientX: 120 }],
    });
    fireEvent.touchEnd(screen.getByRole("button", { name: /Answer card preview/i }), {
      changedTouches: [{ clientX: 10 }],
    });

    expect(screen.getAllByText("2 of 2")[0]).toBeVisible();
  });

  it("uses reduced-motion-aware flip behavior and hides the old swipe hint", () => {
    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      removeEventListener: vi.fn(),
    }));
    Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });

    render(<PublicDeckPreview deck={publicDeck} />);

    expect(screen.getByRole("region", { name: /Prompt card preview/i }).closest(".public-preview"))
      .toHaveAttribute("data-reduced-motion", "true");
    expect(screen.queryByText(/Tap to flip/i)).not.toBeInTheDocument();
  });

  it("renders published custom audio from the frozen public media projection", () => {
    const renderer = generateCardBlueprints({
      fields: {
        Prompt: {
          content: [
            { content: [{ text: "Identify this sound", type: "text" }], type: "paragraph" },
          ],
          schemaVersion: 2,
          type: "doc",
        },
        Recording: {
          alt: "Published spoken clue",
          assetId: "public-audio-id",
          kind: "media",
          mediaKind: "audio",
        },
      },
      kind: "custom",
      schemaVersion: CARD_SCHEMA_VERSION,
      templates: [
        {
          backTemplate: "{{front}}<p>Answer</p>",
          frontTemplate: "{{Prompt}}{{media Recording}}",
          name: "Published audio",
          semanticKey: "published-audio",
        },
      ],
    })[0]?.renderer;
    if (!renderer) throw new Error("Expected a custom public renderer fixture.");
    const signedUrl = "https://media.example.test/public.webm?signature=test";

    render(
      <PublicDeckPreview
        deck={{
          ...publicDeck,
          cardCount: 1,
          cards: [
            {
              back: "Answer",
              cardType: "custom",
              front: "Identify this sound",
              id: "public-custom-card",
              media: [
                {
                  altText: "Published spoken clue",
                  id: "public-audio-id",
                  kind: "audio",
                  mimeType: "audio/webm",
                  signedUrl,
                },
              ],
              nonvisualFallback: "Published spoken clue",
              renderer,
            },
          ],
          supportedCardTypes: ["custom"],
        }}
      />,
    );

    expect(screen.getByLabelText("Published spoken clue")).toHaveAttribute("src", signedUrl);
  });

  it("does not hijack keyboard input or double-toggle nested interactive controls", async () => {
    const user = userEvent.setup();
    render(<PublicDeckPreview deck={publicDeck} />);

    await user.click(screen.getByRole("button", { name: /Next/i }));
    const answer = screen.getByRole("textbox", { name: "Typed answer preview" });
    answer.focus();
    fireEvent.keyDown(answer, { key: " " });
    fireEvent.keyDown(answer, { key: "Enter" });
    expect(screen.getByRole("region", { name: "Prompt card preview" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Reveal answer" }));
    expect(screen.getByRole("region", { name: "Answer card preview" })).toBeVisible();
  });

  it("shows creator attribution, license, public card types, and safe return-aware auth links", () => {
    render(<PublicDeckAttribution deck={publicDeck} />);

    expect(screen.getByRole("heading", { level: 2, name: "Ari Learner" })).toBeVisible();
    expect(screen.getByText("@ari_learns")).toBeVisible();
    expect(screen.getByText("CC BY")).toBeVisible();
    expect(screen.getByText("basic, typed answer")).toBeVisible();
    expect(screen.getByRole("link", { name: "Create your own deck" })).toHaveAttribute(
      "href",
      "/auth/sign-up?returnTo=%2Fdeck%2Fcell-energy",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in?returnTo=%2Fdeck%2Fcell-energy",
    );
    expect(screen.queryByText(publicDeck.publicId)).not.toBeInTheDocument();
  });

  it("handles a published deck with no cards as an honest empty preview", () => {
    render(
      <PublicDeckPreview
        deck={{ ...publicDeck, cardCount: 0, cards: [], supportedCardTypes: [] }}
      />,
    );

    expect(screen.getByText("No cards")).toBeVisible();
    expect(screen.getByText("This published deck has no cards.")).toBeVisible();
    expect(screen.getByRole("button", { name: /Previous/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });
});
