const DEFAULT_PAGE_SIZE = 500;

export interface QueryPage {
  readonly data: unknown;
  readonly error: unknown;
}

type PageReader = (from: number, to: number) => PromiseLike<QueryPage>;

function objectRows(value: unknown): Readonly<Record<string, unknown>>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Readonly<Record<string, unknown>> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

export async function readAllPages(
  readPage: PageReader,
  options: { readonly maximumRows?: number; readonly pageSize?: number } = {},
): Promise<Readonly<Record<string, unknown>>[]> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maximumRows = options.maximumRows ?? Number.POSITIVE_INFINITY;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || maximumRows < 0) {
    throw new Error("INVALID_PAGINATION_OPTIONS");
  }
  const collected: Readonly<Record<string, unknown>>[] = [];
  while (collected.length < maximumRows) {
    const requested = Math.min(pageSize, maximumRows - collected.length);
    const result = await readPage(collected.length, collected.length + requested - 1);
    if (result.error) throw new Error("PAGINATED_QUERY_UNAVAILABLE");
    const page = objectRows(result.data);
    collected.push(...page);
    if (page.length < requested) break;
  }
  return collected;
}

export async function readAllForIds(
  ids: readonly string[],
  readChunkPage: (ids: readonly string[], from: number, to: number) => PromiseLike<QueryPage>,
  options: { readonly chunkSize?: number; readonly concurrency?: number } = {},
): Promise<Readonly<Record<string, unknown>>[]> {
  const chunkSize = options.chunkSize ?? 100;
  const concurrency = options.concurrency ?? 8;
  if (
    !Number.isSafeInteger(chunkSize) ||
    chunkSize < 1 ||
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1
  ) {
    throw new Error("INVALID_PAGINATION_OPTIONS");
  }
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const chunks: string[][] = [];
  for (let index = 0; index < uniqueIds.length; index += chunkSize) {
    chunks.push(uniqueIds.slice(index, index + chunkSize));
  }
  const collected: Readonly<Record<string, unknown>>[] = [];
  for (let index = 0; index < chunks.length; index += concurrency) {
    const batch = await Promise.all(
      chunks
        .slice(index, index + concurrency)
        .map((chunk) => readAllPages((from, to) => readChunkPage(chunk, from, to))),
    );
    for (const result of batch) collected.push(...result);
  }
  return collected;
}
