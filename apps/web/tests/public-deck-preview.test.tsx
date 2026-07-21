import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CARD_SCHEMA_VERSION, generateCardBlueprints } from "@lumen/domain";

import {
  PublicDeckAttribution,
  PublicDeckPreview,
} from "../components/content/public-deck-preview.client";
import { publicDeck } from "./fixtures/content";

describe("public deck preview", () => {
  it("uses separate front and back faces and rotates only the shared inner card", () => {
    const { container } = render(<PublicDeckPreview deck={publicDeck} />);

    const inner = container.querySelector(".flashcard-inner");
    const front = container.querySelector(".flashcard-face.flashcard-front");
    const back = container.querySelector(".flashcard-face.flashcard-back");
    expect(inner).toBeInTheDocument();
    expect(inner).toHaveAttribute("data-flipped", "false");
    expect(front?.parentElement).toBe(inner);
    expect(back?.parentElement).toBe(inner);
    expect(front).toHaveAttribute("data-face", "front");
    expect(back).toHaveAttribute("data-face", "back");
    expect(front).toHaveTextContent("What is ATP?");
    expect(back).toHaveTextContent("The cell's usable energy carrier");
    expect(front).not.toHaveAttribute("style");
    expect(back).not.toHaveAttribute("style");
  });

  it("flips by click and resets to the front when navigating", async () => {
    const user = userEvent.setup();
    const { container } = render(<PublicDeckPreview deck={publicDeck} />);
    const scene = screen.getByRole("group", { name: /Question, card 1 of 2/i });

    expect(scene).toHaveTextContent("What is ATP?");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await user.click(scene);
    expect(screen.getByRole("group", { name: /Answer, card 1 of 2/i })).toBeVisible();
    expect(container.querySelector(".flashcard-inner")).toHaveAttribute("data-flipped", "true");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("group", { name: /Question, card 2 of 2/i })).toBeVisible();
    expect(container.querySelector(".flashcard-inner")).toHaveAttribute("data-flipped", "false");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it.each(["neutral", "ocean", "forest", "contrast"] as const)(
    "applies the frozen %s deck theme to the rendered preview",
    (theme) => {
      const { container } = render(<PublicDeckPreview deck={{ ...publicDeck, theme }} />);
      expect(container.querySelector(".public-preview")).toHaveAttribute("data-deck-theme", theme);
    },
  );

  it("supports Space, Enter, and arrow-key navigation", () => {
    render(<PublicDeckPreview deck={publicDeck} />);
    const scene = screen.getByRole("group", { name: /Question, card 1 of 2/i });

    fireEvent.keyDown(document.body, { key: " " });
    expect(screen.getByRole("group", { name: /Question, card 1 of 2/i })).toBeVisible();
    scene.focus();

    fireEvent.keyDown(scene, { key: " " });
    expect(screen.getByRole("group", { name: /Answer, card 1 of 2/i })).toBeVisible();
    fireEvent.keyDown(scene, { key: "Enter" });
    expect(screen.getByRole("group", { name: /Question, card 1 of 2/i })).toBeVisible();
    fireEvent.keyDown(scene, { key: "ArrowRight" });
    expect(screen.getByRole("group", { name: /Question, card 2 of 2/i })).toBeVisible();
    fireEvent.keyDown(scene, { key: "ArrowLeft" });
    expect(screen.getByRole("group", { name: /Question, card 1 of 2/i })).toBeVisible();
  });

  it("supports touch swipe navigation without flipping the destination", () => {
    render(<PublicDeckPreview deck={publicDeck} />);
    const scene = screen.getByRole("group", { name: /Question, card 1 of 2/i });
    fireEvent.touchStart(scene, { changedTouches: [{ clientX: 120, clientY: 30 }] });
    fireEvent.touchEnd(scene, { changedTouches: [{ clientX: 10, clientY: 35 }] });
    expect(screen.getByRole("group", { name: /Question, card 2 of 2/i })).toBeVisible();
  });

  it("ignores vertical-intent touch gestures", () => {
    render(<PublicDeckPreview deck={publicDeck} />);
    const scene = screen.getByRole("group", { name: /Question, card 1 of 2/i });
    fireEvent.touchStart(scene, { changedTouches: [{ clientX: 120, clientY: 20 }] });
    fireEvent.touchEnd(scene, { changedTouches: [{ clientX: 60, clientY: 130 }] });
    expect(screen.getByRole("group", { name: /Question, card 1 of 2/i })).toBeVisible();
  });

  it("uses a non-rotating reduced-motion state and removes visible duplicate flip copy", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        addEventListener: vi.fn(),
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        removeEventListener: vi.fn(),
      })),
    });
    const { container } = render(<PublicDeckPreview deck={publicDeck} />);

    expect(container.querySelector(".public-preview")).toHaveAttribute(
      "data-reduced-motion",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Flip card" }));
    expect(container.querySelector(".flashcard-inner")).toHaveAttribute("data-flipped", "true");
    expect(screen.queryByText("Tap to flip")).not.toBeInTheDocument();
    expect(screen.queryByText("Reveal answer")).not.toBeInTheDocument();
    expect(screen.queryByText("Show prompt")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Flip card" })).toHaveLength(1);
    expect(screen.getByText(/does not create study progress or history/i)).toHaveClass(
      "visually-hidden",
    );
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

    expect(screen.getAllByLabelText("Published spoken clue")).toHaveLength(2);
    expect(screen.getAllByLabelText("Published spoken clue")[0]).toHaveAttribute("src", signedUrl);
  });

  it("does not hijack nested inputs or flip from nested interactions", async () => {
    const user = userEvent.setup();
    render(<PublicDeckPreview deck={publicDeck} />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    const answer = screen.getByRole("textbox", { name: "Typed answer preview" });
    await user.click(answer);
    fireEvent.keyDown(answer, { key: " " });
    fireEvent.keyDown(answer, { key: "Enter" });
    expect(screen.getByRole("group", { name: /Question, card 2 of 2/i })).toBeVisible();
  });

  it("does not navigate from a touch gesture inside nested interactive content", async () => {
    const user = userEvent.setup();
    render(<PublicDeckPreview deck={publicDeck} />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    const answer = screen.getByRole("textbox", { name: "Typed answer preview" });

    fireEvent.touchStart(answer, { changedTouches: [{ clientX: 10, clientY: 20 }] });
    fireEvent.touchEnd(answer, { changedTouches: [{ clientX: 120, clientY: 25 }] });

    expect(screen.getByRole("group", { name: /Question, card 2 of 2/i })).toBeVisible();
    expect(screen.getByText("2 / 2")).toBeVisible();
  });

  it("does not flip when a nested choice label is clicked", async () => {
    const user = userEvent.setup();
    const renderer = generateCardBlueprints({
      answer: true,
      kind: "true_false",
      schemaVersion: CARD_SCHEMA_VERSION,
      statement: {
        content: [
          {
            content: [{ text: "ATP stores usable energy.", type: "text" }],
            type: "paragraph",
          },
        ],
        schemaVersion: 2,
        type: "doc",
      },
    })[0]?.renderer;
    if (!renderer) throw new Error("Expected a true/false public renderer fixture.");
    const { container } = render(
      <PublicDeckPreview
        deck={{
          ...publicDeck,
          cardCount: 1,
          cards: [
            {
              back: "True",
              cardType: "true_false",
              front: "ATP stores usable energy.",
              id: "public-true-false-card",
              media: [],
              nonvisualFallback: "Choose true or false.",
              renderer,
            },
          ],
          supportedCardTypes: ["true_false"],
        }}
      />,
    );

    const choiceLabel = container.querySelector(".flashcard-front label");
    if (!choiceLabel) throw new Error("Expected a true/false choice label.");
    await user.click(choiceLabel);

    expect(screen.getByRole("group", { name: /Question, card 1 of 1/i })).toBeVisible();
  });

  it("shows compact creator, license, date, and visibility attribution", () => {
    render(<PublicDeckAttribution deck={publicDeck} />);
    const details = screen.getByRole("contentinfo", { name: "Deck details" });
    expect(details).toHaveTextContent("Ari Learner");
    expect(details).toHaveTextContent("cc by");
    expect(details).toHaveTextContent("Updated");
    expect(details).toHaveTextContent("public");
    expect(screen.queryByText(publicDeck.publicId)).not.toBeInTheDocument();
  });

  it("handles a published deck with no cards as an honest empty preview", () => {
    render(
      <PublicDeckPreview
        deck={{ ...publicDeck, cardCount: 0, cards: [], supportedCardTypes: [] }}
      />,
    );
    expect(screen.getByText("This published deck has no cards.")).toBeVisible();
    expect(screen.getByText("0 / 0")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
