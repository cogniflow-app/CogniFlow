import { describe, expect, it } from "vitest";

import { mergeStructuredContent } from "../src";

describe("structured content merge", () => {
  it("merges independent scalar fields", () => {
    expect(
      mergeStructuredContent(
        { description: "Original", title: "Original" },
        { description: "Original", title: "Local title" },
        { description: "Remote description", title: "Original" },
      ),
    ).toEqual({
      mergedPaths: ["content.description"],
      status: "merged",
      value: { description: "Remote description", title: "Local title" },
    });
  });

  it("retains a same-field scalar conflict", () => {
    expect(mergeStructuredContent("Original", "Local", "Remote", "title")).toEqual({
      conflictPaths: ["title"],
      status: "conflict",
    });
  });

  it("merges independent rich-document nodes structurally", () => {
    const base = {
      content: [
        { content: [{ text: "First", type: "text" }], type: "paragraph" },
        { content: [{ text: "Second", type: "text" }], type: "paragraph" },
      ],
      schemaVersion: 2,
      type: "doc",
    };
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.content[0]!.content[0]!.text = "First from local";
    remote.content[1]!.content[0]!.text = "Second from remote";

    const result = mergeStructuredContent(base, local, remote, "front");
    expect(result.status).toBe("merged");
    if (result.status !== "merged") return;
    expect(result.mergedPaths).toEqual(["front.content[1]"]);
    expect(result.value).toEqual({
      ...base,
      content: [
        { content: [{ text: "First from local", type: "text" }], type: "paragraph" },
        { content: [{ text: "Second from remote", type: "text" }], type: "paragraph" },
      ],
    });
  });

  it("retains overlapping rich-document edits and concurrent node insertions", () => {
    const base = {
      content: [{ content: [{ text: "Original", type: "text" }], type: "paragraph" }],
      schemaVersion: 2,
      type: "doc",
    };
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.content[0]!.content[0]!.text = "Local";
    remote.content[0]!.content[0]!.text = "Remote";
    expect(mergeStructuredContent(base, local, remote, "front")).toEqual({
      conflictPaths: ["front.content[0].content[0].text"],
      status: "conflict",
    });

    expect(
      mergeStructuredContent(
        base,
        { ...base, content: [...base.content, { type: "paragraph" }] },
        { ...base, content: [{ type: "paragraph" }, ...base.content] },
        "front",
      ),
    ).toEqual({ conflictPaths: ["front.content"], status: "conflict" });
  });
});
