import type { NumericRule } from "./types";

interface UnitDefinition {
  readonly dimension: string;
  readonly factor: number;
}

const units: Readonly<Record<string, UnitDefinition>> = {
  "": { dimension: "scalar", factor: 1 },
  mm: { dimension: "length", factor: 0.001 },
  cm: { dimension: "length", factor: 0.01 },
  m: { dimension: "length", factor: 1 },
  km: { dimension: "length", factor: 1000 },
  mg: { dimension: "mass", factor: 0.000001 },
  g: { dimension: "mass", factor: 0.001 },
  kg: { dimension: "mass", factor: 1 },
  ms: { dimension: "time", factor: 0.001 },
  s: { dimension: "time", factor: 1 },
  min: { dimension: "time", factor: 60 },
  h: { dimension: "time", factor: 3600 },
  ml: { dimension: "volume", factor: 0.001 },
  l: { dimension: "volume", factor: 1 },
  "%": { dimension: "ratio", factor: 0.01 },
};

interface Quantity {
  readonly baseValue: number;
  readonly dimension: string;
}

function parseQuantity(value: string, fallbackUnit?: string): Quantity | null {
  const match = value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("und")
    .match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)$/u);
  if (!match?.[1]) return null;
  const amount = Number(match[1]);
  const unitKey = match[2] || fallbackUnit?.trim().toLocaleLowerCase("und") || "";
  const unit = units[unitKey];
  if (!unit || !Number.isFinite(amount)) return null;
  return { baseValue: amount * unit.factor, dimension: unit.dimension };
}

export function numericEquivalent(
  expected: string,
  received: string,
  rule: NumericRule = {},
): boolean {
  const expectedQuantity = parseQuantity(expected, rule.expectedUnit);
  const receivedQuantity = parseQuantity(received, rule.expectedUnit);
  if (
    !expectedQuantity ||
    !receivedQuantity ||
    expectedQuantity.dimension !== receivedQuantity.dimension
  ) {
    return false;
  }
  const absoluteTolerance = Math.max(0, rule.absoluteTolerance ?? 1e-9);
  const relativeTolerance = Math.max(0, rule.relativeTolerance ?? 1e-6);
  const difference = Math.abs(expectedQuantity.baseValue - receivedQuantity.baseValue);
  return (
    difference <= absoluteTolerance ||
    difference <= relativeTolerance * Math.max(1, Math.abs(expectedQuantity.baseValue))
  );
}
