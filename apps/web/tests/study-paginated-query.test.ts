import { describe, expect, it, vi } from "vitest";

import { readAllForIds, readAllPages } from "../lib/server/paginated-query";

describe("study repository pagination", () => {
  it("reads past an API row cap with stable ranges", async () => {
    const source = Array.from({ length: 1_205 }, (_, id) => ({ id }));
    const reader = vi.fn((from: number, to: number) =>
      Promise.resolve({ data: source.slice(from, to + 1), error: null }),
    );

    const result = await readAllPages(reader);

    expect(result).toHaveLength(1_205);
    expect(reader.mock.calls).toEqual([
      [0, 499],
      [500, 999],
      [1_000, 1_499],
    ]);
  });

  it("honors bounded history reads and batches long identifier lists", async () => {
    const ids = Array.from({ length: 205 }, (_, id) => `card-${id}`);
    const reader = vi.fn((chunk: readonly string[], from: number) =>
      Promise.resolve({
        data: from === 0 ? chunk.map((id) => ({ id })) : [],
        error: null,
      }),
    );

    const chunked = await readAllForIds(ids, reader);
    const bounded = await readAllPages(
      (from, to) =>
        Promise.resolve({
          data: Array.from({ length: to - from + 1 }, (_, offset) => ({ id: from + offset })),
          error: null,
        }),
      { maximumRows: 10_000 },
    );

    expect(chunked).toHaveLength(205);
    expect(reader.mock.calls.map(([chunk]) => chunk.length)).toEqual([100, 100, 5]);
    expect(bounded).toHaveLength(10_000);
  });

  it("fails closed when any page fails", async () => {
    await expect(
      readAllPages(() => Promise.resolve({ data: null, error: { message: "denied" } })),
    ).rejects.toThrow("PAGINATED_QUERY_UNAVAILABLE");
  });
});
