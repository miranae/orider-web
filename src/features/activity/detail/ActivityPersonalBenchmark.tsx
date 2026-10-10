import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button, ChartFrame, Select, Stat, Text } from "../../../theme";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { useAuth } from "../../../contexts/AuthContext";
import { usePdc, type UsePdcState } from "../../../hooks/usePdc";
import { personalBenchmark } from "./personalBenchmarkPresentation";
import type { MetricsLike } from "./metricsPresentation";
import "./activity-personal-benchmark.css";

export interface ActivityPersonalBenchmarkProps {
  activityId: string;
  ownerUid: string | null | undefined;
  sport: string;
  metrics: MetricsLike | null;
  suppliedPdcState?: UsePdcState;
}
function duration(seconds: number) { return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${seconds / 60}m` : `${seconds / 3600}h`; }
function BenchmarkReading({ metrics, state }: { metrics: MetricsLike | null; state: UsePdcState }) {
  const { t, i18n } = useTranslation("activity");
  const id = useId();
  const [selectedDuration, setSelectedDuration] = useState(300);
  if (state.status !== "ready") return <Text as="p" variant="bodySmall" tone="secondary">{t(`benchmark.${state.status}`)}</Text>;
  const benchmark = personalBenchmark(metrics, state.pdc);
  if (benchmark.reason !== "ready") return <Text as="p" variant="bodySmall" tone="secondary">{t(`benchmark.${benchmark.reason}`)}</Text>;
  const { points, asOf } = benchmark;
  const selected = points.find(point => point.seconds === selectedDuration) ?? points[0]!;
  const values = points.flatMap(point => [point.watts, point.referenceWatts]);
  const low = Math.max(0, Math.min(...values) * 0.85), high = Math.max(...values) * 1.15;
  const first = Math.log(points[0]!.seconds), last = Math.log(points[points.length - 1]!.seconds);
  const x = (seconds: number) => first === last ? 199 : 62 + (Math.log(seconds) - first) / (last - first) * 274;
  const y = (watts: number) => 24 + (high - watts) / (high - low) * 118;
  const gap = Math.round(selected.watts - selected.referenceWatts);
  const fraction = selected.watts / selected.referenceWatts * 100;
  return <div className="activity-benchmark-reading space-y-3">
    <Text as="p" variant="bodySmall" tone="secondary">{t("benchmark.scope", { date: new Date(asOf).toLocaleDateString(i18n.language) })}</Text>
    <ChartFrame variant="embedded">
      <div className="activity-benchmark-legend"><Text variant="bodySmall"><span className="activity-benchmark-line" />{t("benchmark.current")}</Text><Text variant="bodySmall" tone="secondary"><span className="activity-benchmark-line activity-benchmark-line--reference" />{t("benchmark.reference")}</Text></div>
      <svg className="activity-benchmark-chart" viewBox="0 0 360 176" role="img" aria-label={t("benchmark.chart")}>
        {[0, 0.5, 1].map(fraction => <g key={fraction}><line x1={62} x2={336} y1={24 + fraction * 118} y2={24 + fraction * 118} stroke="var(--grid-soft)" /><text x={54} y={29 + fraction * 118} textAnchor="end" fill="var(--chart-grid-label)">{Math.round(high - (high - low) * fraction)}</text></g>)}
        <text x={62} y={15} fill="var(--chart-grid-label)">W</text>
        <line x1={x(selected.seconds)} x2={x(selected.seconds)} y1={24} y2={142} stroke="var(--line-soft)" />
        {(["watts", "referenceWatts"] as const).map(key => <g key={key}><polyline points={points.map(point => `${x(point.seconds)},${y(point[key])}`).join(" ")} fill="none" stroke={key === "watts" ? "var(--accent)" : "var(--ink-2)"} strokeWidth={2} strokeDasharray={key === "watts" ? undefined : "6 4"} />{points.map(point => <circle key={point.key} cx={x(point.seconds)} cy={y(point[key])} r={selected.key === point.key ? 4 : 2} fill={key === "watts" ? "var(--accent)" : "var(--ink-2)"} />)}</g>)}
        {[points[0]!, ...(points.length > 2 ? [points[Math.floor(points.length / 2)]!] : []), ...(points.length > 1 ? [points[points.length - 1]!] : [])].map(point => <text key={point.key} x={x(point.seconds)} y={166} textAnchor="middle" fill="var(--chart-grid-label)">{duration(point.seconds)}</text>)}
        {points.map((point, index) => {
          const start = index === 0 ? 62 : (x(points[index - 1]!.seconds) + x(point.seconds)) / 2;
          const end = index === points.length - 1 ? 336 : (x(point.seconds) + x(points[index + 1]!.seconds)) / 2;
          return <rect key={point.key} data-duration={point.seconds} x={start} y={24} width={end - start} height={118} fill="transparent" className="activity-benchmark-hit" onClick={() => setSelectedDuration(point.seconds)}><title>{duration(point.seconds)}</title></rect>;
        })}
      </svg>
      <label className="activity-benchmark-duration" htmlFor={id}><Text variant="bodySmall" tone="secondary">{t("benchmark.duration")}</Text><Select id={id} value={selected.seconds} onChange={event => setSelectedDuration(Number(event.target.value))}>{points.map(point => <option key={point.key} value={point.seconds}>{duration(point.seconds)}</option>)}</Select></label>
      <div className="activity-benchmark-values"><Stat compact label={t("benchmark.current")} value={selected.watts.toFixed(0)} unit="W" /><Stat compact label={t("benchmark.reference")} value={selected.referenceWatts.toFixed(0)} unit="W" /></div>
      <Text as="p" variant="bodySmall" tone="secondary">{t("benchmark.difference", { gap: `${gap > 0 ? "+" : ""}${gap}`, fraction: fraction.toFixed(1) })}</Text>
      <LocalizedLink className="activity-benchmark-source" to={`/activity/${encodeURIComponent(selected.activityId)}`}>{t("benchmark.source", { date: selected.date })}</LocalizedLink>
    </ChartFrame>
    <Text as="p" variant="bodySmall" tone="secondary">{t("benchmark.timingShort")}</Text>
    <details className="activity-benchmark-help">
      <summary>{t("benchmark.readingGuide")}</summary>
      <div className="space-y-3">
        <Text as="p" variant="bodySmall" tone="secondary">{t("benchmark.timingNote")}</Text>
        <Text as="p" variant="bodySmall" tone="secondary">{t("benchmark.curveNote")}</Text>
      </div>
    </details>
  </div>;
}
function LazyBenchmark({ ownerUid, metrics }: { ownerUid: string; metrics: MetricsLike | null }) {
  const state = usePdc(ownerUid);
  return <BenchmarkReading metrics={metrics} state={state} />;
}
function BenchmarkSection({ ownerUid, metrics, suppliedPdcState }: ActivityPersonalBenchmarkProps & { ownerUid: string }) {
  const { t } = useTranslation("activity");
  const [opened, setOpened] = useState(false);
  const [mounted, setMounted] = useState(false);
  const id = useId();
  return <section className="activity-personal-benchmark space-y-3">
    <Button variant="ghost" size="sm" aria-expanded={opened} aria-controls={id} onClick={() => { setOpened(value => !value); setMounted(true); }}><Text variant="subtitle">{t("benchmark.title")}</Text>{opened ? <ChevronUp aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}</Button>
    {mounted && <div id={id} hidden={!opened}>{suppliedPdcState ? <BenchmarkReading metrics={metrics} state={suppliedPdcState} /> : <LazyBenchmark metrics={metrics} ownerUid={ownerUid} />}</div>}
  </section>;
}
export function ActivityPersonalBenchmark(props: ActivityPersonalBenchmarkProps) {
  const { user } = useAuth();
  const { firestore } = useFirebaseServices();
  if (!props.ownerUid || user?.uid !== props.ownerUid || props.sport !== "bike") return null;
  const key = `${props.ownerUid}:${props.activityId}:${firestore?.app?.name}:${firestore?.app?.options.projectId}`;
  return <BenchmarkSection key={key} {...props} ownerUid={props.ownerUid} />;
}
