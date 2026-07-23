type Token =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "symbol"; readonly value: string };

function tokenize(expression: string): readonly Token[] | null {
  if (expression.length === 0 || expression.length > 256) return null;
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const character = expression[index] ?? "";
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    const number = expression.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/iu);
    if (number?.[0]) {
      const value = Number(number[0]);
      if (!Number.isFinite(value)) return null;
      tokens.push({ kind: "number", value });
      index += number[0].length;
      continue;
    }
    if ("+-*/^()".includes(character)) {
      tokens.push({ kind: "symbol", value: character });
      index += 1;
      continue;
    }
    return null;
  }
  return tokens;
}

export function evaluateSafeMath(expression: string): number | null {
  const tokens = tokenize(expression);
  if (!tokens) return null;
  let cursor = 0;

  const peek = (value: string) =>
    tokens[cursor]?.kind === "symbol" && tokens[cursor]?.value === value;
  const consume = (value: string) => {
    if (!peek(value)) return false;
    cursor += 1;
    return true;
  };

  const primary = (): number | null => {
    const token = tokens[cursor];
    if (token?.kind === "number") {
      cursor += 1;
      return token.value;
    }
    if (consume("(")) {
      const value = expressionValue();
      if (value === null || !consume(")")) return null;
      return value;
    }
    return null;
  };

  const unary = (): number | null => {
    if (consume("+")) return unary();
    if (consume("-")) {
      const value = unary();
      return value === null ? null : -value;
    }
    return primary();
  };

  const power = (): number | null => {
    const base = unary();
    if (base === null) return null;
    if (!consume("^")) return base;
    const exponent = power();
    if (exponent === null || Math.abs(exponent) > 100) return null;
    const value = base ** exponent;
    return Number.isFinite(value) ? value : null;
  };

  const term = (): number | null => {
    let value = power();
    if (value === null) return null;
    while (peek("*") || peek("/")) {
      const operator = tokens[cursor]?.value;
      cursor += 1;
      const right = power();
      if (right === null || (operator === "/" && right === 0)) return null;
      value = operator === "*" ? value * right : value / right;
      if (!Number.isFinite(value)) return null;
    }
    return value;
  };

  const expressionValue = (): number | null => {
    let value = term();
    if (value === null) return null;
    while (peek("+") || peek("-")) {
      const operator = tokens[cursor]?.value;
      cursor += 1;
      const right = term();
      if (right === null) return null;
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };

  const result = expressionValue();
  return result !== null && cursor === tokens.length && Number.isFinite(result) ? result : null;
}

export function mathEquivalent(expected: string, received: string, tolerance = 1e-9): boolean {
  const expectedValue = evaluateSafeMath(expected);
  const receivedValue = evaluateSafeMath(received);
  if (expectedValue === null || receivedValue === null) return false;
  return (
    Math.abs(expectedValue - receivedValue) <= tolerance * Math.max(1, Math.abs(expectedValue))
  );
}
