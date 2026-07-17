type UnknownRecord = Readonly<Record<string, unknown>>;

const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

export interface MediaLinkInput {
  readonly altText: string;
  readonly assetId: string;
  readonly position: number;
  readonly purpose: "prompt";
}

export class InvalidMediaReferenceError extends Error {
  readonly paths: readonly string[];

  constructor(paths: readonly string[]) {
    super("Embedded media references must use canonical asset UUIDs.");
    this.name = "InvalidMediaReferenceError";
    this.paths = Object.freeze([...paths]);
  }
}

function boundedReferenceText(value: string): string {
  return [...value.normalize("NFKC").trim()].slice(0, 1_000).join("");
}

/** Collects every private media identity embedded in a validated authoring payload. */
export function collectMediaLinks(value: unknown): readonly MediaLinkInput[] {
  const found = new Map<string, string>();
  const invalidPaths: string[] = [];

  function register(rawId: unknown, path: string, altText: string) {
    if (rawId === undefined) return;
    if (typeof rawId !== "string" || !CANONICAL_UUID_PATTERN.test(rawId)) {
      invalidPaths.push(path);
      return;
    }
    found.set(rawId.toLowerCase(), boundedReferenceText(altText));
  }

  function visit(candidate: unknown, path: string) {
    if (Array.isArray(candidate)) {
      for (const [index, child] of candidate.entries()) visit(child, `${path}[${String(index)}]`);
      return;
    }
    const item = asRecord(candidate);
    if (!item) return;
    register(
      item.assetId,
      `${path}.assetId`,
      typeof item.alt === "string"
        ? item.alt
        : typeof item.imageAlt === "string"
          ? item.imageAlt
          : typeof item.transcript === "string"
            ? item.transcript
            : "",
    );
    register(
      item.imageAssetId,
      `${path}.imageAssetId`,
      typeof item.imageAlt === "string" ? item.imageAlt : "",
    );
    register(
      item.referenceAssetId,
      `${path}.referenceAssetId`,
      typeof item.text === "string" ? item.text : "",
    );
    register(
      item.annotationAssetId,
      `${path}.annotationAssetId`,
      typeof item.alt === "string" ? `${item.alt} annotation` : "Image annotation",
    );
    for (const [key, child] of Object.entries(item)) visit(child, `${path}.${key}`);
  }
  visit(value, "authoringData");
  if (invalidPaths.length > 0) throw new InvalidMediaReferenceError(invalidPaths);
  return [...found].map(([assetId, altText], position) => ({
    altText,
    assetId,
    position,
    purpose: "prompt",
  }));
}
