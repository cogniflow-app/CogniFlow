import type { RichDocument } from "@lumen/domain";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RichEditor } from "../components/content/rich-editor.client";

describe("structured rich-content editor", () => {
  beforeEach(() => {
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => true),
    });
  });

  it("labels the editing surface and exposes a complete keyboard-addressable toolbar", () => {
    render(<RichEditor label="Front / prompt" onChange={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: "Front / prompt" })).toBeVisible();
    const toolbar = screen.getByRole("toolbar", { name: "Front / prompt formatting" });
    for (const name of [
      "Bold",
      "Italic",
      "Underline",
      "Strike through",
      "Heading",
      "Bulleted list",
      "Numbered list",
      "Block quote",
      "Inline code",
      "Insert link",
      "Undo",
      "Redo",
      "Open insert command palette",
    ]) {
      expect(toolbar).toContainElement(screen.getByRole("button", { name }));
    }
  });

  it("opens the semantic block palette from the documented keyboard shortcut", async () => {
    const user = userEvent.setup();
    render(<RichEditor label="Back / answer" onChange={vi.fn()} />);

    const editor = screen.getByRole("textbox", { name: "Back / answer" });
    editor.focus();
    await user.keyboard("{Control>}k{/Control}");

    expect(screen.getByRole("dialog", { name: "Insert block" })).toBeVisible();
    for (const block of [
      "Table",
      "Code block",
      "Math block",
      "Hint",
      "Callout",
      "Citation",
      "Divider",
      "Subheading",
    ]) {
      expect(screen.getByRole("button", { name: block })).toBeVisible();
    }
  });

  it("serializes browser edits to versioned rich JSON instead of stored HTML", () => {
    const onChange = vi.fn();
    render(<RichEditor label="Prompt" onChange={onChange} />);
    const editor = screen.getByRole("textbox", { name: "Prompt" });
    editor.innerHTML = "<p>Cellular respiration</p>";
    fireEvent.input(editor);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        content: [
          expect.objectContaining({
            content: [expect.objectContaining({ text: "Cellular respiration", type: "text" })],
            type: "paragraph",
          }),
        ],
        schemaVersion: 2,
        type: "doc",
      }),
    );
    expect(JSON.stringify(onChange.mock.calls.at(-1)?.[0])).not.toContain("<p>");
  });

  it("preserves direct list-item and table-cell text emitted by browser editing commands", () => {
    const onChange = vi.fn();
    render(<RichEditor label="Structured response" onChange={onChange} />);
    const editor = screen.getByRole("textbox", { name: "Structured response" });
    editor.innerHTML =
      "<ul><li>Direct list text</li></ul><table><tbody><tr><th>Heading</th><td>Direct cell text</td></tr></tbody></table>";
    fireEvent.input(editor);

    const value = onChange.mock.calls.at(-1)?.[0] as RichDocument;
    expect(JSON.stringify(value)).toContain("Direct list text");
    expect(JSON.stringify(value)).toContain("Heading");
    expect(JSON.stringify(value)).toContain("Direct cell text");
    expect(value.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "bulletList" }),
        expect.objectContaining({ type: "table" }),
      ]),
    );
  });

  it("inserts a semantic task list with an unchecked, readable task item", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RichEditor label="Plan" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Open insert command palette" }));
    await user.click(await screen.findByRole("button", { name: "Task list" }));

    const value = onChange.mock.calls.at(-1)?.[0];
    expect(value).toMatchObject({ schemaVersion: 2, type: "doc" });
    expect(value.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: [
            {
              attrs: { checked: false },
              content: [
                {
                  content: [{ text: "Task", type: "text" }],
                  type: "paragraph",
                },
              ],
              type: "taskItem",
            },
          ],
          type: "taskList",
        }),
      ]),
    );
    expect(JSON.stringify(value)).not.toContain("data-task-list");
  });

  it("stores highlighted code as plain source plus a bounded language hint", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RichEditor label="Example" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Open insert command palette" }));
    await user.click(await screen.findByRole("button", { name: "Code block" }));
    const dialog = await screen.findByRole("dialog", { name: "Insert highlighted code" });
    await user.type(within(dialog).getByRole("textbox", { name: "Language" }), "TypeScript");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Source code" }),
      "const answer = 42;",
    );
    await user.click(within(dialog).getByRole("button", { name: "Insert code block" }));

    const value = onChange.mock.calls.at(-1)?.[0] as RichDocument;
    const code = value.content.find((node) => node.type === "codeBlock");
    expect(code).toMatchObject({ attrs: { language: "typescript" }, type: "codeBlock" });
    expect(code && "content" in code ? code.content.map((node) => node.text).join("") : "").toBe(
      "const answer = 42;",
    );
    expect(JSON.stringify(value)).not.toContain("syntax-keyword");
  });

  it("wraps only the selected text in a structured inline-code mark", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RichEditor label="Definition" onChange={onChange} />);
    const editor = screen.getByRole("textbox", { name: "Definition" });
    editor.innerHTML = "<p>Use const here</p>";
    fireEvent.input(editor);
    const text = editor.querySelector("p")?.firstChild;
    if (!text) throw new Error("Expected an editable text node.");
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 9);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    await user.click(screen.getByRole("button", { name: "Inline code" }));

    const value = onChange.mock.calls.at(-1)?.[0] as RichDocument;
    expect(value.content).toEqual([
      expect.objectContaining({
        content: [
          expect.objectContaining({ text: "Use " }),
          expect.objectContaining({ marks: [{ type: "code" }], text: "const" }),
          expect.objectContaining({ text: " here" }),
        ],
        type: "paragraph",
      }),
    ]);
  });
});
