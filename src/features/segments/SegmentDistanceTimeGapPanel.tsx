import { useLayoutEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SegmentGapRef } from "@shared/segment-distance-time-gap";
import { useSegmentDistanceTimeGap } from "../../hooks/useSegmentDistanceTimeGap";
import { useLocale } from "../../contexts/LocaleContext";
import { Button, Text } from "../../theme/components";
import { LocalizedLink } from "../../components/LocalizedLink";
import "./segmentDistanceTimeGap.css";
interface Props { segmentId: string; pair: [SegmentGapRef, SegmentGapRef] | null; sourceIdentity: string;
  onMarker?: (position: [number, number] | null) => void }
export default function SegmentDistanceTimeGapPanel({ segmentId, pair, sourceIdentity, onMarker }: Props) {
  const { t, i18n } = useTranslation("segment"), { units } = useLocale(), sliderId = useId();
  const query = useSegmentDistanceTimeGap(segmentId, pair, sourceIdentity), response = query.response;
  const result = response?.state === "available" ? response.comparison : null;
  const [scrub, setScrub] = useState<{ result: typeof result; index: number } | null>(null);
  const index = scrub?.result === result ? scrub.index : 0;
  useLayoutEffect(() => { onMarker?.(null); return () => onMarker?.(null); }, [result, onMarker]);
  if (!query.eligible) return null;
  const distance = (m: number) => `${(m / (units === "imperial" ? 1609.344 : 1000)).toLocaleString(i18n.language, { maximumFractionDigits: 3 })} ${units === "imperial" ? "mi" : "km"}`;
  const signed = (seconds: number | null) => seconds === null ? "—" : `${seconds > 0 ? "+" : seconds < 0 ? "−" : ""}${Math.abs(seconds).toLocaleString(i18n.language, { maximumFractionDigits: 3 })} s`;
  const valid = result?.points.flatMap(p => [p.gapSec, p.departureSec[0] !== null && p.departureSec[1] !== null ? p.departureSec[0] - p.departureSec[1] : null]
    .filter((v): v is number => v !== null)) ?? [];
  const extent = Math.max(1, ...valid.map(Math.abs));
  const point = result?.points[index];
  const lines: string[] = []; let line: string[] = [];
  const eventMarkers: { x: number; arrivalY: number; departureY: number | null; unobserved: boolean }[] = [];
  if (result) for (let i = 0; i < result.points.length; i++) {
    const p = result.points[i]!;
    if (p.gapSec === null) { if (line.length) lines.push(line.join(" ")); line = []; continue; }
    const x = 32 + (p.distanceM - result.fromDistanceM) / (result.toDistanceM - result.fromDistanceM) * 296, y = 78 - p.gapSec / extent * 50;
    line.push(`${x},${y}`);
    const events = result.events.filter(e => e.distanceM === p.distanceM);
    if (events.length) {
      lines.push(line.join(" ")); line = [];
      const unobserved = events.some(e => e.kind === "unobserved_gap");
      const departure = p.departureSec[0] !== null && p.departureSec[1] !== null ? p.departureSec[0] - p.departureSec[1] : null;
      const departureY = !unobserved && departure !== null ? 78 - departure / extent * 50 : null;
      eventMarkers.push({ x, arrivalY: y, departureY, unobserved });
      // 미관측 시간은 연결하지 않는다. 관측된 정지 시간만 같은 거리의 세로 구간으로 표시한다.
      if (departureY !== null) line.push(`${x},${departureY}`);
    }
  }
  if (line.length) lines.push(line.join(" "));
  return <section className="segment-gap-panel" aria-label={t("timeGap.title")}>
    <Text as="h3" variant="bodyMedium" weight={600}>{t("timeGap.title")}</Text>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("timeGap.actionNote")}</Text>
    <Button className="segment-gap-action" variant="primary" disabled={query.state === "loading"} loading={query.state === "loading"} onClick={() => { onMarker?.(null); void query.inspect(); }}>{t(query.state === "idle" ? "timeGap.compare" : "timeGap.refresh")}</Button>
    {query.state !== "idle" && query.state !== "available" && <Text as="p" variant="bodyMedium" tone="secondary" role="status">{t(query.response?.reason ? `timeGap.reasons.${query.response.reason}` : `timeGap.states.${query.state}`)}</Text>}
    {result && <>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("timeGap.basis")}</Text>
      <details className="segment-gap-proof"><summary>{t("timeGap.calculationDetails")}</summary>
        <Text as="p" variant="bodyMedium" tone="secondary">{t("timeGap.calculation")}</Text>
      </details>
      <Text as="p" variant="bodyMedium">{t("timeGap.span", { from: distance(result.fromDistanceM), to: distance(result.toDistanceM) })} · {t(result.fullCurrentGeometry ? "timeGap.full" : "timeGap.partial")}</Text>
      <div className="segment-gap-chart-frame">
      <svg className="segment-gap-chart" viewBox="0 0 360 170" role="img" aria-label={t("timeGap.chart")}>
        <text x="4" y="18">{signed(extent)}</text><text x="4" y="146">{signed(-extent)}</text>
        <line x1="32" x2="328" y1="78" y2="78" className="segment-gap-zero" />
        {lines.map((points, i) => <polyline key={i} points={points} className="segment-gap-line" />)}
        {eventMarkers.map((m, i) => <g key={i} data-event={m.unobserved ? "unobserved_gap" : "plateau"}>
          <circle cx={m.x} cy={m.arrivalY} r="3" className="segment-gap-event"><title>{t("timeGap.events")}</title></circle>
          {m.departureY !== null && <line x1={m.x} x2={m.x} y1={m.arrivalY} y2={m.departureY} className="segment-gap-line" />}
        </g>)}
        <text x="32" y="167">{distance(result.fromDistanceM)}</text><text x="328" y="167" textAnchor="end">{distance(result.toDistanceM)}</text>
      </svg>
      <label htmlFor={sliderId}><Text variant="bodyMedium">{t("timeGap.position")}</Text></label>
      <input id={sliderId} className="segment-gap-scrub" type="range" min={0} max={result.points.length - 1} value={index}
        aria-valuetext={point ? `${distance(point.distanceM)} · ${signed(point.gapSec)}` : "—"}
        onChange={e => { const next = Number(e.target.value); setScrub({ result, index: next }); onMarker?.(result.points[next]?.marker ?? null); }} />
      <Text as="p" variant="bodyMedium" mono>{point ? `${distance(point.distanceM)} · ${signed(point.gapSec)}` : "—"}</Text>
      </div>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("timeGap.sign")}</Text>
      {result.events.length > 0 && <Text as="p" variant="bodyMedium" tone="secondary">{t("timeGap.events")}</Text>}
      {point && point.departureSec.some((v, i) => v === null || v !== point.elapsedSec[i]) && <Text as="p" variant="bodyMedium">{t("timeGap.interval", { a: signed(point.elapsedSec[0]), aEnd: signed(point.departureSec[0]), b: signed(point.elapsedSec[1]), bEnd: signed(point.departureSec[1]) })}</Text>}
      <div className="segment-gap-sources">{result.sources.map((source, i) => <LocalizedLink key={source.effortId} to={`/activity/${source.activityId}`}>
        {t(i ? "timeGap.b" : "timeGap.a")} · {new Date(source.activityStartMs).toLocaleString(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })} KST
      </LocalizedLink>)}</div>
    </>}
  </section>;
}
