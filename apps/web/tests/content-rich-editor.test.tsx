import type { RichDocument } from "@lumen/domain";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RichEditor } from "../components/content/rich-editor.client";

vi.mock("../components/content/media-uploader.client", () => ({
  MediaUploader: ({
    kind,
    label,
    onUploaded,
  }: {
    kind: "audio" | "image";
    label: string;
    onUploaded: (asset: {
      altText: string;
      id: string;
      kind: "audio" | "image";
      mimeType: string;
      signedUrl: string | null;
      transcript: string;
    }) => void;
  }) => (
    <button
      onClick={() =>
        onUploaded({
          altText: "Accessible test media",
          id: `asset-${kind}`,
          kind,
          mimeType: kind === "image" ? "image/png" : "audio/mpeg",
          signedUrl: null,
          transcript: kind === "audio" ? "Spoken test media" : "",
        })
      }
      type="button"
    >
      Attach {label}
    </button>
  ),
}));

const insertionDocument = {
  attrs: { language: "fr" },
  content: [
    {
      content: [{ text: "beforeafter", type: "text" }],
      type: "paragraph",
    },
  ],
  schemaVersion: 2,
  type: "doc",
} as const satisfies RichDocument;

type BlockInsertion =
  | "audio"
  | "callout"
  | "citation"
  | "codeBlock"
  | "externalVideo"
  | "hint"
  | "horizontalRule"
  | "image"
  | "mathBlock"
  | "table"
  | "taskList";

function placeCaretInsideParagraph(editor: HTMLElement): void {
  const text = editor.querySelector("p")?.firstChild;
  if (!(text instanceof Text)) throw new Error("Expected a paragraph text node.");
  editor.focus();
  const range = document.createRange();
  range.setStart(text, 6);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.select(editor);
}

async function insertBlock(
  kind: BlockInsertion,
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Open insert command palette" }));

  if (kind === "table") {
    await user.click(await screen.findByRole("button", { name: "Table" }));
    return;
  }
  if (kind === "taskList") {
    await user.click(await screen.findByRole("button", { name: "Task list" }));
    return;
  }
  if (kind === "hint" || kind === "callout" || kind === "citation") {
    const label = kind === "hint" ? "Hint" : kind === "callout" ? "Callout" : "Citation";
    await user.click(await screen.findByRole("button", { name: label }));
    return;
  }
  if (kind === "horizontalRule") {
    await user.click(await screen.findByRole("button", { name: "Divider" }));
    return;
  }
  if (kind === "codeBlock") {
    await user.click(await screen.findByRole("button", { name: "Code block" }));
    const dialog = await screen.findByRole("dialog", { name: "Insert highlighted code" });
    await user.type(within(dialog).getByRole("textbox", { name: "Language" }), "TypeScript");
    await user.type(within(dialog).getByRole("textbox", { name: "Source code" }), "const x = 1;");
    await user.click(within(dialog).getByRole("button", { name: "Insert code block" }));
    return;
  }
  if (kind === "mathBlock") {
    await user.click(await screen.findByRole("button", { name: "Math block" }));
    const dialog = await screen.findByRole("dialog", { name: "Insert math block" });
    await user.type(within(dialog).getByRole("textbox", { name: "LaTeX" }), "E=mc^2");
    await user.click(within(dialog).getByRole("button", { name: "Insert math" }));
    return;
  }
  if (kind === "image") {
    await user.click(await screen.findByRole("button", { name: "Image" }));
    const dialog = await screen.findByRole("dialog", { name: "Insert image" });
    await user.click(within(dialog).getByRole("button", { name: "Attach Image file" }));
    await user.click(await within(dialog).findByRole("button", { name: "Insert prepared image" }));
    return;
  }
  if (kind === "audio") {
    await user.click(await screen.findByRole("button", { name: "Audio" }));
    const dialog = await screen.findByRole("dialog", { name: "Insert audio" });
    await user.click(within(dialog).getByRole("button", { name: "Attach Audio attachment" }));
    return;
  }

  await user.click(await screen.findByRole("button", { name: "External video" }));
  const dialog = await screen.findByRole("dialog", { name: "Insert external video" });
  await user.type(within(dialog).getByRole("textbox", { name: "Video title" }), "Test video");
  await user.type(
    within(dialog).getByRole("textbox", { name: "YouTube or Vimeo URL" }),
    "https://www.youtube.com/watch?v=abc12345",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Insert privacy-enhanced reference" }),
  );
}

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

  it("preserves an existing document language on the first browser edit", () => {
    const onChange = vi.fn();
    render(<RichEditor document={insertionDocument} label="French prompt" onChange={onChange} />);
    const editor = screen.getByRole("textbox", { name: "French prompt" });
    expect(editor).toHaveAttribute("lang", "fr");
    const paragraph = editor.querySelector("p");
    if (!paragraph) throw new Error("Expected a rendered paragraph.");
    paragraph.textContent = "bonjour";

    fireEvent.input(editor);

    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ attrs: { language: "fr" } });
  });

  it("uses the explicit content-language control for editing semantics and serialization", () => {
    const onChange = vi.fn();
    render(
      <RichEditor
        document={insertionDocument}
        label="German prompt"
        language="de"
        onChange={onChange}
      />,
    );
    const editor = screen.getByRole("textbox", { name: "German prompt" });
    expect(editor).toHaveAttribute("lang", "de");

    fireEvent.input(editor);

    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ attrs: { language: "de" } });
  });

  it("keeps inline math semantic and inline when inserted at a paragraph cursor", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RichEditor document={insertionDocument} label="Formula" onChange={onChange} />);
    const editor = screen.getByRole("textbox", { name: "Formula" });
    placeCaretInsideParagraph(editor);

    await user.click(screen.getByRole("button", { name: "Open insert command palette" }));
    await user.click(await screen.findByRole("button", { name: "Inline math" }));
    const dialog = await screen.findByRole("dialog", { name: "Insert inline math" });
    await user.type(within(dialog).getByRole("textbox", { name: "LaTeX" }), "x^2");
    await user.click(within(dialog).getByRole("button", { name: "Insert math" }));
    fireEvent.input(editor);

    const value = onChange.mock.calls.at(-1)?.[0] as RichDocument;
    expect(value.content).toEqual([
      expect.objectContaining({
        content: [
          expect.objectContaining({ text: "before", type: "text" }),
          { attrs: { latex: "x^2" }, type: "inlineMath" },
          expect.objectContaining({ text: "after", type: "text" }),
        ],
        type: "paragraph",
      }),
    ]);
  });

  it.each([
    ["table", "table"],
    ["task list", "taskList"],
    ["hint callout", "hint"],
    ["callout", "callout"],
    ["citation", "citation"],
    ["divider", "horizontalRule"],
    ["code block", "codeBlock"],
    ["math block", "mathBlock"],
    ["image", "image"],
    ["audio", "audio"],
    ["external video", "externalVideo"],
  ] as const)(
    "lifts a %s insertion to the document root without flattening or dropping it",
    async (_label, kind) => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(
        <RichEditor document={insertionDocument} label={`${kind} field`} onChange={onChange} />,
      );
      const editor = screen.getByRole("textbox", { name: `${kind} field` });
      placeCaretInsideParagraph(editor);

      await insertBlock(kind, user);
      fireEvent.input(editor);

      const value = onChange.mock.calls.at(-1)?.[0] as RichDocument;
      expect(value.attrs).toEqual({ language: "fr" });
      expect(value.content.map((node) => node.type)).toEqual([
        "paragraph",
        kind === "hint" ? "callout" : kind,
        "paragraph",
      ]);
      expect(value.content[0]).toMatchObject({
        content: [{ text: "before", type: "text" }],
        type: "paragraph",
      });
      expect(value.content.at(-1)).toMatchObject({
        content: [{ text: "after", type: "text" }],
        type: "paragraph",
      });
      if (kind === "hint") expect(value.content[1]).toMatchObject({ attrs: { kind: "hint" } });
    },
  );
});
