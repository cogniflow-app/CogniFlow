import { normalizedTokens } from "./normalization";

export function damerauLevenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  const rows = left.length + 2;
  const columns = right.length + 2;
  const maximum = left.length + right.length;
  const matrix = new Int32Array(rows * columns);
  const lastSeen = new Map<string, number>();
  const offset = (row: number, column: number) => row * columns + column;
  const read = (row: number, column: number) => matrix[offset(row, column)] ?? maximum;
  const write = (row: number, column: number, value: number) => {
    matrix[offset(row, column)] = value;
  };

  write(0, 0, maximum);
  for (let index = 0; index <= left.length; index += 1) {
    write(index + 1, 0, maximum);
    write(index + 1, 1, index);
  }
  for (let index = 0; index <= right.length; index += 1) {
    write(0, index + 1, maximum);
    write(1, index + 1, index);
  }

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let matchingRightIndex = 0;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const lastMatchingLeftIndex = lastSeen.get(right[rightIndex - 1] ?? "") ?? 0;
      const lastMatchingRightIndex = matchingRightIndex;
      let cost = 1;
      if (left[leftIndex - 1] === right[rightIndex - 1]) {
        cost = 0;
        matchingRightIndex = rightIndex;
      }

      write(
        leftIndex + 1,
        rightIndex + 1,
        Math.min(
          read(leftIndex, rightIndex) + cost,
          read(leftIndex + 1, rightIndex) + 1,
          read(leftIndex, rightIndex + 1) + 1,
          read(lastMatchingLeftIndex, lastMatchingRightIndex) +
            (leftIndex - lastMatchingLeftIndex - 1) +
            1 +
            (rightIndex - lastMatchingRightIndex - 1),
        ),
      );
    }
    lastSeen.set(left[leftIndex - 1] ?? "", leftIndex);
  }

  return read(left.length + 1, right.length + 1);
}

export function editSimilarity(left: string, right: string): number {
  const length = Math.max(left.length, right.length);
  return length === 0 ? 1 : 1 - damerauLevenshtein(left, right) / length;
}

export function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizedTokens(left));
  const rightTokens = new Set(normalizedTokens(right));
  if (leftTokens.size === 0 && rightTokens.size === 0) return 1;
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const precision = intersection / rightTokens.size;
  const recall = intersection / leftTokens.size;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}
