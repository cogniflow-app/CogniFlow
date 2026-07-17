// @vitest-environment node

import { describe, expect, it } from "vitest";

import { nullableRpcArgument, toDatabaseJson } from "../lib/server/database-arguments";

describe("database argument normalization", () => {
  it("copies readonly validated values into mutable Postgres JSON and omits undefined fields", () => {
    const source = Object.freeze({
      fields: Object.freeze([Object.freeze({ key: "Front", required: true })]),
      optional: undefined,
      version: 2,
    });

    expect(toDatabaseJson(source)).toEqual({
      fields: [{ key: "Front", required: true }],
      version: 2,
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1n, new Date()])(
    "rejects a non-JSON boundary value %s",
    (value) => {
      expect(() => toDatabaseJson(value)).toThrow(TypeError);
    },
  );

  it("rejects circular values instead of recursing indefinitely", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => toDatabaseJson(circular)).toThrow(/circular reference/u);
  });

  it("preserves a validated SQL null at runtime despite generated input-type erasure", () => {
    const value: string = nullableRpcArgument<string>(null);

    expect(value).toBeNull();
  });
});
