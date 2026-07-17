import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ContentApiRequestError,
  PendingContentMutations,
  performContentMutation,
} from "../lib/content/client-mutations";

function success(data: unknown = { id: "deck-1" }): Response {
  return new Response(JSON.stringify({ data, status: "created" }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

describe("client content mutation idempotency", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reuses one key when a create response is lost, then rotates after definitive success", async () => {
    const createKey = vi
      .fn<() => string>()
      .mockReturnValueOnce("key-1")
      .mockReturnValueOnce("key-2");
    const pending = new PendingContentMutations(createKey);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network response lost"))
      .mockResolvedValueOnce(success())
      .mockResolvedValueOnce(success({ id: "deck-2" }));
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      body: { title: "Biology", visibility: "private" },
      fallbackMessage: "The deck could not be created.",
      method: "POST",
      operation: "deck:create",
      pending,
      url: "/api/content/decks",
    } as const;

    await expect(performContentMutation(input)).rejects.toThrow("network response lost");
    await expect(performContentMutation(input)).resolves.toMatchObject({ data: { id: "deck-1" } });
    await expect(performContentMutation(input)).resolves.toMatchObject({ data: { id: "deck-2" } });

    const keys = fetchMock.mock.calls.map((call) => {
      const request = call[1] as RequestInit;
      return (JSON.parse(String(request.body)) as { idempotencyKey: string }).idempotencyKey;
    });
    expect(keys).toEqual(["key-1", "key-1", "key-2"]);
    expect(createKey).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["undecodable", new Response("{", { status: 200 })],
    ["non-object", new Response('"unexpected"', { status: 200 })],
    ["missing usable data", new Response('{"data":null,"status":"created"}', { status: 200 })],
  ])("keeps the key when a successful response is %s", async (_case, uncertainResponse) => {
    const createKey = vi
      .fn<() => string>()
      .mockReturnValueOnce("key-1")
      .mockReturnValueOnce("key-2");
    const pending = new PendingContentMutations(createKey);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(uncertainResponse)
      .mockResolvedValueOnce(success());
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      body: { title: "Biology", visibility: "private" },
      fallbackMessage: "The deck could not be created.",
      method: "POST",
      operation: "deck:create",
      pending,
      url: "/api/content/decks",
    } as const;

    await expect(performContentMutation(input)).rejects.toMatchObject({
      code: "INTERNAL",
      retryable: true,
    });
    await expect(performContentMutation(input)).resolves.toMatchObject({ data: { id: "deck-1" } });

    const keys = fetchMock.mock.calls.map((call) => {
      const request = call[1] as RequestInit;
      return (JSON.parse(String(request.body)) as { idempotencyKey: string }).idempotencyKey;
    });
    expect(keys).toEqual(["key-1", "key-1"]);
    expect(createKey).toHaveBeenCalledOnce();
  });

  it("preserves conflict metadata and rotates after a definitive rejection", async () => {
    const pending = new PendingContentMutations(
      vi.fn<() => string>().mockReturnValueOnce("key-1").mockReturnValueOnce("key-2"),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "CONFLICT",
            currentVersion: 8,
            message: "The deck changed.",
            retryable: false,
          }),
          { headers: { "Content-Type": "application/json" }, status: 409 },
        ),
      )
      .mockResolvedValueOnce(success());
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      body: { action: "duplicate", expectedVersion: 7 },
      fallbackMessage: "The deck could not be duplicated.",
      operation: "deck:duplicate",
      pending,
      url: "/api/content/decks/deck-1",
    } as const;

    const failure = await performContentMutation(input).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ContentApiRequestError);
    expect(failure).toMatchObject({ code: "CONFLICT", currentVersion: 8, retryable: false });
    await performContentMutation(input);

    const keys = fetchMock.mock.calls.map((call) => {
      const request = call[1] as RequestInit;
      return (JSON.parse(String(request.body)) as { idempotencyKey: string }).idempotencyKey;
    });
    expect(keys).toEqual(["key-1", "key-2"]);
  });

  it("treats an edited payload as a new logical operation after a retryable failure", async () => {
    const pending = new PendingContentMutations(
      vi.fn<() => string>().mockReturnValueOnce("key-1").mockReturnValueOnce("key-2"),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "INTERNAL", message: "Try again.", retryable: true }), {
          headers: { "Content-Type": "application/json" },
          status: 503,
        }),
      )
      .mockResolvedValueOnce(success());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      performContentMutation({
        body: { name: "Science" },
        fallbackMessage: "Folder unavailable.",
        operation: "folder:create",
        pending,
        url: "/api/content/folders",
      }),
    ).rejects.toMatchObject({ retryable: true });
    await performContentMutation({
      body: { name: "Life science" },
      fallbackMessage: "Folder unavailable.",
      operation: "folder:create",
      pending,
      url: "/api/content/folders",
    });

    const keys = fetchMock.mock.calls.map((call) => {
      const request = call[1] as RequestInit;
      return (JSON.parse(String(request.body)) as { idempotencyKey: string }).idempotencyKey;
    });
    expect(keys).toEqual(["key-1", "key-2"]);
  });
});
