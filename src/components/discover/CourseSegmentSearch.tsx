import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchStaticJson } from "../../utils/staticJson";
import { segmentTileUrl } from "../../utils/segmentTiles";
import { LocalizedLink } from "../LocalizedLink";
import { Button, Text } from "../../theme/components";

interface SegmentHit { id: string; name: string; city?: string; state?: string; distance: number; averageGrade: number }
export default function CourseSegmentSearch({ query }: { query: string }) {
  const { t } = useTranslation("common");
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [segments, setSegments] = useState<SegmentHit[]>([]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setFailed(false);
    fetchStaticJson<{ segments: SegmentHit[] }>(segmentTileUrl("overview.json"))
      .then((data) => { if (!cancelled) setSegments(data.segments); })
      .catch(() => { if (!cancelled) { setSegments([]); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [retry]);
  const hits = useMemo(() => segments.filter((s) => `${s.name} ${s.city ?? ""} ${s.state ?? ""}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8), [segments, query]);
  return <section className="p-3 space-y-2">
    <Text as="h2" variant="subtitle">{t("nav.segments")}</Text>
    {failed && <div role="alert"><Text>{t("course:segmentSearch.loadFailed")}</Text><Button size="sm" variant="secondary" onClick={() => setRetry(value => value + 1)}>{t("course:segmentSearch.retry")}</Button></div>}
    {loading && <Text role="status">{t("course:segmentSearch.loading")}</Text>}
    {hits.map((s) => <LocalizedLink data-testid="E1-1-2" className="block" key={s.id} to={`/segment/${s.id}`}><Text>{s.name} · {(s.distance / 1000).toFixed(1)} km · {s.averageGrade.toFixed(1)}%</Text></LocalizedLink>)}
    <LocalizedLink data-testid="E1-1-3" to={`/explore/segments?q=${encodeURIComponent(query)}`}>{t("discover.viewAll")}</LocalizedLink>
  </section>;
}
