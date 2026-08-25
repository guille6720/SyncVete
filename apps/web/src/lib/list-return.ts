/** Preserve list filters when navigating to detail / create and back. */

export function withListReturn(
  detailPath: string,
  searchParams: { toString(): string } | string
): string {
  const query = typeof searchParams === 'string' ? searchParams : searchParams.toString();
  if (!query) return detailPath;
  const sep = detailPath.includes('?') ? '&' : '?';
  return `${detailPath}${sep}return=${encodeURIComponent(query)}`;
}

/** Resolve list href from optional `return` query (must be a query string, not a path/URL). */
export function resolveListHref(basePath: string, returnQuery?: string | null): string {
  if (!returnQuery || returnQuery.includes('://') || returnQuery.startsWith('/')) {
    return basePath;
  }
  return `${basePath}?${returnQuery}`;
}

/** Build list query string from known filter fields (server pages). */
export function buildListQuery(parts: Record<string, string | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(parts)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}
