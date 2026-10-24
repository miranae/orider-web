import { useEffect, useState } from "react";
import { usePagedSearch } from "./usePagedSearch";
import { listPublicClubs, type PublicClubFilters } from "../services/publicClubs";

/** 익명 소개는 HTTP API만 사용하고 실패 시 과거 결과를 재사용하지 않는다. */
export function usePublicClubDirectory(filters: PublicClubFilters, enabled: boolean) {
  const scope = JSON.stringify(filters);
  const [settled, setSettled] = useState(scope);
  useEffect(() => { const timer = setTimeout(() => setSettled(scope), 300); return () => clearTimeout(timer); }, [scope]);
  const page = usePagedSearch(enabled && scope === settled ? scope : null, (cursor: string | null) => listPublicClubs(filters, cursor));
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { if (document.visibilityState !== "hidden") page.retry(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); };
  }, [enabled, page.retry]);
  return { ...page, groups: page.error ? [] : page.items, loading: page.loading || (enabled && scope !== settled) };
}
