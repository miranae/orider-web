import { useCallback, useEffect, useRef, useState } from "react";

export { SEARCH_PAGE_SIZE } from "../constants/pagination";
export interface SearchPage<T, C> { items: T[]; cursor: C | null; hasMore: boolean; error?: unknown }

/** One request per user action; a changed scope invalidates pending pages. */
export function usePagedSearch<T extends { id: string }, C>(key: string | null, fetchPage: (cursor: C | null) => Promise<SearchPage<T, C>>) {
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const epoch = useRef(0);
  const scope = useRef(key);
  const pending = useRef(false);
  const cursor = useRef<C | null>(null);
  const more = useRef(false);
  const [items, setItems] = useState<T[]>([]);
  const [resultKey, setResultKey] = useState<string | null>(key);
  const [loading, setLoading] = useState(key !== null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [hasMore, setHasMore] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const request = useCallback(async (reset: boolean) => {
    if (!reset && (pending.current || !more.current)) return;
    const version = epoch.current;
    pending.current = true;
    if (reset) setLoading(true); else setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchRef.current(reset ? null : cursor.current);
      if (version !== epoch.current) return;
      setResultKey(scope.current);
      cursor.current = page.cursor;
      more.current = page.hasMore;
      setHasMore(page.hasMore);
      setError(page.error ?? null);
      setItems(previous => reset && !page.error ? page.items : [...new Map([...previous, ...page.items].map(item => [item.id, item])).values()]);
    } catch (reason) {
      if (version === epoch.current) { setResultKey(scope.current); setError(reason); }
    } finally {
      if (version === epoch.current) {
        pending.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    epoch.current += 1;
    pending.current = false;
    cursor.current = null;
    more.current = false;
    if (scope.current !== key || key === null) setItems([]);
    scope.current = key;
    setError(null);
    setHasMore(false);
    setLoadingMore(false);
    if (key !== null) void request(true); else setLoading(false);
    return () => { epoch.current += 1; };
  }, [key, retryKey, request]);

  const current = resultKey === key;
  return { items: current ? items : [], loading: loading || (!current && key !== null), loadingMore: current && loadingMore, error: current ? error : null, hasMore: current && hasMore, loadMore: () => request(false), retry: () => setRetryKey(value => value + 1) };
}
