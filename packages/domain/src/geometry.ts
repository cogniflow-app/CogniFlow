import {
  createRuntimeSchema,
  hasOnlyKeys,
  issue,
  readArray,
  readNumber,
  readOneOf,
  readRecord,
  readString,
  type SchemaParser,
  type ValidationIssue,
} from "./validation";

export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
}

export interface NormalizedRectangle {
  readonly kind: "rectangle";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface NormalizedEllipse {
  readonly kind: "ellipse";
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusX: number;
  readonly radiusY: number;
}

export interface NormalizedPolygon {
  readonly kind: "polygon";
  readonly points: readonly NormalizedPoint[];
}

export type NormalizedShape = NormalizedRectangle | NormalizedEllipse | NormalizedPolygon;

export interface ImageOcclusionRegion {
  readonly semanticKey: string;
  readonly groupKey: string;
  readonly shape: NormalizedShape;
  readonly label: string;
  readonly altText?: string;
}

export interface DiagramHotspot {
  readonly semanticKey: string;
  readonly shape: NormalizedShape;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly promptDirection: "label_to_region" | "region_to_label" | "both";
}

export interface DrawingPoint extends NormalizedPoint {
  readonly pressure?: number;
  readonly timeOffsetMs?: number;
}

export interface DrawingStroke {
  readonly semanticKey: string;
  readonly color: string;
  /** Brush width in CSS pixels; point positions remain normalized for responsive replay. */
  readonly width: number;
  readonly points: readonly DrawingPoint[];
}

const SEMANTIC_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/u;

const parsePoint: SchemaParser<NormalizedPoint> = (input, path, issues) => {
  const record = readRecord(input, path, issues);
  if (!record) return undefined;
  hasOnlyKeys(record, ["x", "y"], path, issues);
  const x = readNumber(record.x, `${path}.x`, issues, { min: 0, max: 1 });
  const y = readNumber(record.y, `${path}.y`, issues, { min: 0, max: 1 });
  return x === undefined || y === undefined ? undefined : Object.freeze({ x, y });
};

export const normalizedPointSchema = createRuntimeSchema<NormalizedPoint>(
  "normalized point",
  parsePoint,
);

function rectangleParser(
  record: Readonly<Record<string, unknown>>,
  path: string,
  issues: ValidationIssue[],
): NormalizedRectangle | undefined {
  hasOnlyKeys(record, ["kind", "x", "y", "width", "height"], path, issues);
  const x = readNumber(record.x, `${path}.x`, issues, { min: 0, max: 1 });
  const y = readNumber(record.y, `${path}.y`, issues, { min: 0, max: 1 });
  const width = readNumber(record.width, `${path}.width`, issues, {
    min: Number.EPSILON,
    max: 1,
  });
  const height = readNumber(record.height, `${path}.height`, issues, {
    min: Number.EPSILON,
    max: 1,
  });
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined;
  }
  if (x + width > 1 || y + height > 1) {
    return issue(issues, path, "out_of_bounds", "Rectangle must remain inside the image");
  }
  return Object.freeze({ kind: "rectangle", x, y, width, height });
}

function ellipseParser(
  record: Readonly<Record<string, unknown>>,
  path: string,
  issues: ValidationIssue[],
): NormalizedEllipse | undefined {
  hasOnlyKeys(record, ["kind", "centerX", "centerY", "radiusX", "radiusY"], path, issues);
  const centerX = readNumber(record.centerX, `${path}.centerX`, issues, { min: 0, max: 1 });
  const centerY = readNumber(record.centerY, `${path}.centerY`, issues, { min: 0, max: 1 });
  const radiusX = readNumber(record.radiusX, `${path}.radiusX`, issues, {
    min: Number.EPSILON,
    max: 0.5,
  });
  const radiusY = readNumber(record.radiusY, `${path}.radiusY`, issues, {
    min: Number.EPSILON,
    max: 0.5,
  });
  if (
    centerX === undefined ||
    centerY === undefined ||
    radiusX === undefined ||
    radiusY === undefined
  ) {
    return undefined;
  }
  if (
    centerX - radiusX < 0 ||
    centerX + radiusX > 1 ||
    centerY - radiusY < 0 ||
    centerY + radiusY > 1
  ) {
    return issue(issues, path, "out_of_bounds", "Ellipse must remain inside the image");
  }
  return Object.freeze({ kind: "ellipse", centerX, centerY, radiusX, radiusY });
}

function polygonArea(points: readonly NormalizedPoint[]): number {
  let area = 0;
  for (const [index, point] of points.entries()) {
    const next = points[(index + 1) % points.length];
    if (next) area += point.x * next.y - next.x * point.y;
  }
  return Math.abs(area) / 2;
}

function crossProduct(a: NormalizedPoint, b: NormalizedPoint, c: NormalizedPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(
  a: NormalizedPoint,
  b: NormalizedPoint,
  c: NormalizedPoint,
  d: NormalizedPoint,
): boolean {
  const first = crossProduct(a, b, c);
  const second = crossProduct(a, b, d);
  const third = crossProduct(c, d, a);
  const fourth = crossProduct(c, d, b);
  if (first * second < 0 && third * fourth < 0) return true;
  const onSegment = (
    start: NormalizedPoint,
    end: NormalizedPoint,
    point: NormalizedPoint,
  ): boolean =>
    point.x >= Math.min(start.x, end.x) &&
    point.x <= Math.max(start.x, end.x) &&
    point.y >= Math.min(start.y, end.y) &&
    point.y <= Math.max(start.y, end.y);
  const epsilon = 1e-12;
  return (
    (Math.abs(first) < epsilon && onSegment(a, b, c)) ||
    (Math.abs(second) < epsilon && onSegment(a, b, d)) ||
    (Math.abs(third) < epsilon && onSegment(c, d, a)) ||
    (Math.abs(fourth) < epsilon && onSegment(c, d, b))
  );
}

function polygonSelfIntersects(points: readonly NormalizedPoint[]): boolean {
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    const firstStart = points[firstIndex];
    const firstEnd = points[(firstIndex + 1) % points.length];
    if (!firstStart || !firstEnd) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      const adjacent =
        secondIndex === firstIndex + 1 || (firstIndex === 0 && secondIndex === points.length - 1);
      if (adjacent) continue;
      const secondStart = points[secondIndex];
      const secondEnd = points[(secondIndex + 1) % points.length];
      if (
        secondStart &&
        secondEnd &&
        segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)
      ) {
        return true;
      }
    }
  }
  return false;
}

function polygonParser(
  record: Readonly<Record<string, unknown>>,
  path: string,
  issues: ValidationIssue[],
): NormalizedPolygon | undefined {
  hasOnlyKeys(record, ["kind", "points"], path, issues);
  const points = readArray(record.points, `${path}.points`, issues, parsePoint, {
    min: 3,
    max: 64,
  });
  if (!points) return undefined;
  if (
    new Set(points.map((point) => `${point.x}:${point.y}`)).size < 3 ||
    polygonArea(points) < 1e-8 ||
    polygonSelfIntersects(points)
  ) {
    return issue(
      issues,
      path,
      "degenerate_polygon",
      "Polygon must contain distinct non-collinear points without self-intersections",
    );
  }
  return Object.freeze({ kind: "polygon", points: Object.freeze(points) });
}

const parseShape: SchemaParser<NormalizedShape> = (input, path, issues) => {
  const record = readRecord(input, path, issues);
  if (!record) return undefined;
  const kind = readOneOf(
    record.kind,
    ["rectangle", "ellipse", "polygon"] as const,
    `${path}.kind`,
    issues,
  );
  if (kind === "rectangle") return rectangleParser(record, path, issues);
  if (kind === "ellipse") return ellipseParser(record, path, issues);
  if (kind === "polygon") return polygonParser(record, path, issues);
  return undefined;
};

export const normalizedShapeSchema = createRuntimeSchema<NormalizedShape>(
  "normalized shape",
  parseShape,
);

const parseOcclusionRegion: SchemaParser<ImageOcclusionRegion> = (input, path, issues) => {
  const record = readRecord(input, path, issues);
  if (!record) return undefined;
  hasOnlyKeys(record, ["semanticKey", "groupKey", "shape", "label", "altText"], path, issues);
  const semanticKey = readString(record.semanticKey, `${path}.semanticKey`, issues, {
    min: 1,
    max: 128,
    pattern: SEMANTIC_KEY_PATTERN,
  });
  const groupKey = readString(record.groupKey, `${path}.groupKey`, issues, {
    min: 1,
    max: 128,
    pattern: SEMANTIC_KEY_PATTERN,
  });
  const shape = parseShape(record.shape, `${path}.shape`, issues);
  const label = readString(record.label, `${path}.label`, issues, { min: 1, max: 500 });
  const altText =
    record.altText === undefined
      ? undefined
      : readString(record.altText, `${path}.altText`, issues, { min: 1, max: 1_000 });
  if (!semanticKey || !groupKey || !shape || !label) return undefined;
  return Object.freeze({ semanticKey, groupKey, shape, label, ...(altText ? { altText } : {}) });
};

export const imageOcclusionRegionSchema = createRuntimeSchema<ImageOcclusionRegion>(
  "image occlusion region",
  parseOcclusionRegion,
);

function uniqueAliases(
  aliases: readonly string[],
  label: string,
  path: string,
  issues: ValidationIssue[],
): readonly string[] {
  const normalizedLabel = label.normalize("NFKC").toLocaleLowerCase();
  const seen = new Set<string>();
  const values: string[] = [];
  for (const alias of aliases) {
    const normalized = alias.normalize("NFKC").toLocaleLowerCase();
    if (normalized === normalizedLabel || seen.has(normalized)) {
      issue(issues, path, "duplicate_alias", "Aliases must be unique and different from the label");
      continue;
    }
    seen.add(normalized);
    values.push(alias);
  }
  return Object.freeze(values);
}

const parseHotspot: SchemaParser<DiagramHotspot> = (input, path, issues) => {
  const record = readRecord(input, path, issues);
  if (!record) return undefined;
  hasOnlyKeys(
    record,
    ["semanticKey", "shape", "label", "aliases", "promptDirection"],
    path,
    issues,
  );
  const semanticKey = readString(record.semanticKey, `${path}.semanticKey`, issues, {
    min: 1,
    max: 128,
    pattern: SEMANTIC_KEY_PATTERN,
  });
  const shape = parseShape(record.shape, `${path}.shape`, issues);
  const label = readString(record.label, `${path}.label`, issues, { min: 1, max: 500 });
  const aliases = readArray(
    record.aliases ?? [],
    `${path}.aliases`,
    issues,
    (value, aliasPath, aliasIssues) =>
      readString(value, aliasPath, aliasIssues, { min: 1, max: 500 }),
    { max: 50 },
  );
  const promptDirection = readOneOf(
    record.promptDirection ?? "region_to_label",
    ["label_to_region", "region_to_label", "both"] as const,
    `${path}.promptDirection`,
    issues,
  );
  if (!semanticKey || !shape || !label || !aliases || !promptDirection) return undefined;
  return Object.freeze({
    semanticKey,
    shape,
    label,
    aliases: uniqueAliases(aliases, label, `${path}.aliases`, issues),
    promptDirection,
  });
};

export const diagramHotspotSchema = createRuntimeSchema<DiagramHotspot>(
  "diagram hotspot",
  parseHotspot,
);

const parseDrawingPoint: SchemaParser<DrawingPoint> = (input, path, issues) => {
  const record = readRecord(input, path, issues);
  if (!record) return undefined;
  hasOnlyKeys(record, ["x", "y", "pressure", "timeOffsetMs"], path, issues);
  const x = readNumber(record.x, `${path}.x`, issues, { min: 0, max: 1 });
  const y = readNumber(record.y, `${path}.y`, issues, { min: 0, max: 1 });
  const pressure =
    record.pressure === undefined
      ? undefined
      : readNumber(record.pressure, `${path}.pressure`, issues, { min: 0, max: 1 });
  const timeOffsetMs =
    record.timeOffsetMs === undefined
      ? undefined
      : readNumber(record.timeOffsetMs, `${path}.timeOffsetMs`, issues, {
          min: 0,
          max: 86_400_000,
          integer: true,
        });
  if (x === undefined || y === undefined) return undefined;
  return Object.freeze({
    x,
    y,
    ...(pressure !== undefined ? { pressure } : {}),
    ...(timeOffsetMs !== undefined ? { timeOffsetMs } : {}),
  });
};

export const drawingStrokeSchema = createRuntimeSchema<DrawingStroke>(
  "drawing stroke",
  (input, path, issues) => {
    const record = readRecord(input, path, issues);
    if (!record) return undefined;
    hasOnlyKeys(record, ["semanticKey", "color", "width", "points"], path, issues);
    const semanticKey = readString(record.semanticKey, `${path}.semanticKey`, issues, {
      min: 1,
      max: 128,
      pattern: SEMANTIC_KEY_PATTERN,
    });
    const color = readString(record.color, `${path}.color`, issues, {
      min: 7,
      max: 7,
      pattern: COLOR_PATTERN,
    });
    const width = readNumber(record.width, `${path}.width`, issues, {
      min: 0.25,
      max: 64,
    });
    const points = readArray(record.points, `${path}.points`, issues, parseDrawingPoint, {
      min: 1,
      max: 20_000,
    });
    if (!semanticKey || !color || width === undefined || !points) return undefined;
    return Object.freeze({
      semanticKey,
      color: color.toLowerCase(),
      width,
      points: Object.freeze(points),
    });
  },
);
