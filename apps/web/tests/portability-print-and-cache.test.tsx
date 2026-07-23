import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PrintableDeckDocument } from "../components/portability/printable-deck.client";

const root = resolve(import.meta.dirname, "../../..");
const printCss = readFileSync(resolve(root, "apps/web/app/phase-six.css"), "utf8");
const artifactRoute = readFileSync(
  resolve(root, "apps/web/app/api/portability/artifacts/[artifactId]/route.ts"),
  "utf8",
);
const serviceWorker = readFileSync(resolve(root, "apps/web/public/sw.js"), "utf8");
const deck = {
  cardCount: 2,
  description: "A deliberately long synthetic description for printable layout coverage.",
  noteCount: 2,
  title: "Synthetic biology",
  updatedAt: "2026-07-23T12:00:00.000Z",
};
const cards = [
  { answer: "Energy carrier", front: "ATP", id: "card-1" },
  {
    answer: "A long answer ".repeat(50),
    front: "A long prompt ".repeat(40),
    id: "card-2",
  },
];

describe("printable portability documents", () => {
  it("renders guides, cut-out cards, tests with answer keys, and reports", () => {
    const rendered = render(<PrintableDeckDocument cards={cards} deck={deck} layout="guide" />);
    expect(screen.getByRole("region", { name: "Print controls" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Study guide" })).toBeVisible();

    rendered.rerender(<PrintableDeckDocument cards={cards} deck={deck} layout="cards" />);
    expect(screen.getByRole("region", { name: "Cut-out flashcards" })).toBeVisible();
    expect(screen.getAllByText("Front")).toHaveLength(2);
    expect(screen.getAllByText("Back")).toHaveLength(2);

    rendered.rerender(<PrintableDeckDocument cards={cards} deck={deck} layout="test" />);
    expect(screen.getByRole("region", { name: "Practice test questions" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Answer key" })).toBeVisible();
    expect(screen.getByLabelText("Answer space for question 1")).toBeVisible();

    rendered.rerender(<PrintableDeckDocument cards={cards} deck={deck} layout="report" />);
    expect(screen.getByRole("region", { name: "Deck progress report" })).toBeVisible();
    expect(screen.getByText("Cards represented here")).toBeVisible();
  });

  it("updates paper, orientation, margins, and invokes browser print", async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    vi.stubGlobal("print", print);
    const { container } = render(
      <PrintableDeckDocument cards={cards} deck={deck} layout="cards" />,
    );
    await user.selectOptions(screen.getByLabelText("Paper size"), "Letter");
    await user.selectOptions(screen.getByLabelText("Orientation"), "landscape");
    await user.selectOptions(screen.getByLabelText("Print margins"), "18");
    expect(container.querySelector("style")?.textContent).toContain(
      "@page { size: Letter landscape; margin: 18mm; }",
    );
    await user.click(screen.getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledOnce();
  });

  it("hides application chrome and prevents card clipping in print CSS", () => {
    expect(printCss).toContain("@media print");
    expect(printCss).toContain(".workspace-rail");
    expect(printCss).toContain(".workspace-mobile-bar");
    expect(printCss).toContain(".portability-print-toolbar");
    expect(printCss).toMatch(/break-inside:\s*avoid/u);
    expect(printCss).toMatch(/page-break-inside:\s*avoid/u);
  });
});

describe("private portability cache boundary", () => {
  it("never service-worker caches private jobs, uploads, restores, or artifacts", () => {
    for (const path of [
      '"/app/portability"',
      '"/api/portability"',
      '"/portability/upload"',
      '"/portability/artifact"',
      '"/portability/backup"',
      '"/portability/restore"',
    ]) {
      expect(serviceWorker).toContain(path);
    }
    expect(serviceWorker).toContain("isNeverCache(url)");
  });

  it("serves authenticated artifacts with private no-store and anti-sniff headers", () => {
    expect(artifactRoute).toContain('"Cache-Control": "private, no-store, max-age=0"');
    expect(artifactRoute).toContain('"X-Content-Type-Options": "nosniff"');
    expect(artifactRoute).toContain('"X-Robots-Tag": "noindex, nofollow, noarchive"');
    expect(artifactRoute).toContain("admin_get_portability_artifact_object");
  });
});
