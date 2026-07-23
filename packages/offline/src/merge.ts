type StructuredValue = unknown;

export type StructuredMergeResult =
  | {
      readonly mergedPaths: readonly string[];
      readonly status: "merged";
      readonly value: StructuredValue;
    }
  | {
      readonly conflictPaths: readonly string[];
      readonly status: "conflict";
    };

const MISSING = Symbol("missing");
type MergeValue = StructuredValue | typeof MISSING;

function isRecord(value: MergeValue): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameValue(left: MergeValue, right: MergeValue): boolean {
  if (left === MISSING || right === MISSING) return left === right;
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((value, index) => sameValue(value, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      sameValue(leftKeys, rightKeys) &&
      leftKeys.every((key) =>
        sameValue(
          Object.hasOwn(left, key) ? left[key] : MISSING,
          Object.hasOwn(right, key) ? right[key] : MISSING,
        ),
      )
    );
  }
  return false;
}

function childPath(parent: string, child: string): string {
  return parent ? `${parent}.${child}` : child;
}

function mergeValue(
  base: MergeValue,
  local: MergeValue,
  remote: MergeValue,
  path: string,
): StructuredMergeResult {
  if (sameValue(local, remote)) {
    if (local === MISSING) return { mergedPaths: [], status: "merged", value: MISSING };
    return { mergedPaths: [], status: "merged", value: local };
  }
  if (sameValue(local, base)) {
    if (remote === MISSING) return { mergedPaths: [path], status: "merged", value: MISSING };
    return { mergedPaths: [path], status: "merged", value: remote };
  }
  if (sameValue(remote, base)) {
    if (local === MISSING) return { mergedPaths: [], status: "merged", value: MISSING };
    return { mergedPaths: [], status: "merged", value: local };
  }

  if (isRecord(base) && isRecord(local) && isRecord(remote)) {
    const output: Record<string, unknown> = {};
    const mergedPaths: string[] = [];
    const conflictPaths: string[] = [];
    const keys = [
      ...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]),
    ].sort();
    for (const key of keys) {
      const result = mergeValue(
        Object.hasOwn(base, key) ? base[key] : MISSING,
        Object.hasOwn(local, key) ? local[key] : MISSING,
        Object.hasOwn(remote, key) ? remote[key] : MISSING,
        childPath(path, key),
      );
      if (result.status === "conflict") {
        conflictPaths.push(...result.conflictPaths);
      } else {
        mergedPaths.push(...result.mergedPaths);
        if (result.value !== MISSING) output[key] = result.value;
      }
    }
    return conflictPaths.length > 0
      ? { conflictPaths, status: "conflict" }
      : { mergedPaths, status: "merged", value: output };
  }

  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    if (base.length !== local.length || base.length !== remote.length) {
      return { conflictPaths: [path], status: "conflict" };
    }
    const output: unknown[] = [];
    const mergedPaths: string[] = [];
    const conflictPaths: string[] = [];
    for (let index = 0; index < base.length; index += 1) {
      const result = mergeValue(base[index], local[index], remote[index], `${path}[${index}]`);
      if (result.status === "conflict") {
        conflictPaths.push(...result.conflictPaths);
      } else {
        mergedPaths.push(...result.mergedPaths);
        output.push(result.value);
      }
    }
    return conflictPaths.length > 0
      ? { conflictPaths, status: "conflict" }
      : { mergedPaths, status: "merged", value: output };
  }

  return { conflictPaths: [path], status: "conflict" };
}

/**
 * Performs a conservative three-way merge over structured JSON values.
 *
 * Independent object keys and stable array positions merge recursively. Concurrent
 * insertions/deletions or overlapping scalar edits remain explicit conflicts so
 * serialized rich documents are never treated as plain text or silently overwritten.
 */
export function mergeStructuredContent(
  base: StructuredValue,
  local: StructuredValue,
  remote: StructuredValue,
  rootPath = "content",
): StructuredMergeResult {
  return mergeValue(base, local, remote, rootPath);
}
