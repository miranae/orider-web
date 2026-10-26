import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button, ChartFrame, Disclosure, Select, Stat, Text } from "../../../theme";
import DurationCurveChart from "../../../components/DurationCurveChart";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { useAuth } from "../../../contexts/AuthContext";
import { usePdc, type UsePdcState } from "../../../hooks/usePdc";
import { personalBenchmark } from "./personalBenchmarkPresentation";
import type { MetricsLike } from "./metricsPresentation";
import "./activity-personal-benchmark.css";
import { ICON_SIZE } from "../../../theme/tokens/icon";

export interface ActivityPersonalBenchmarkProps {
  activityId: string;
  ownerUid: string | null | undefined;
  sport: string;
  metrics: MetricsLike | null;
  suppliedPdcState?: UsePdcState;
  defaultExpanded?: boolean;
  embedded?: boolean;
}
function BenchmarkReading({ metrics, state }: { metrics: MetricsLike | null; state: UsePdcState; defaultExpanded?: boolean }) {
  const { t, i18n } = useTranslation("activity");
  const id = useId();
  const [selectedDuration, setSelectedDuration] = useState(300);
  const duration = (seconds: number) => i18n.language.startsWith("ko")
    ? seconds < 60 ? `${seconds}초` : seconds < 3600 ? `${seconds / 60}분` : `${seconds / 3600}시간`
    : seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${seconds / 60}m` : `${seconds / 3600}h`;
  if (state.status !== "ready") return <Text as="p" variant="bodySmall" tone="secondary">{t(`benchmark.${state.status}`)}</Text>;
  const benchmark = personalBenchmark(metrics, state.pdc);
  if (benchmark.reason !== "ready") return <Text as="p" variant="bodySmall" tone="secondary">{t(`benchmark.${benchmark.reason}`)}</Text>;
  const { points, asOf } = benchmark;
  const selected = points.find(point => point.seconds === selectedDuration) ?? points[0]!;
  const gap = Math.round(selected.watts - selected.referenceWatts);
  const fraction = selected.watts / selected.referenceWatts * 100;
  return <div className="activity-benchmark-reading space-y-3">
    <Text as="p" variant="bodySmall" tone="secondary">{t("benchmark.scope", { date: new Date(asOf).toLocaleDateString(i18n.language) })}</Text>
    <ChartFrame variant="embedded">
      <DurationCurveChart points={points.map(point => ({ durationSeconds: point.seconds, value: point.watts }))}
        unit="W" color="var(--chart-power)" datasetLabel={t("benchmark.current")}
        comparison={{ label: t("benchmark.reference"), values: points.map(point => point.referenceWatts) }}
        showLegend xScale="log" unitAxisTitle heightClassName="h-48 sm:h-56" ariaLabel={t("benchmark.chart")}
        emptyTitle={t("benchmark.missing")} emptyDescription={t("benchmark.curveNote")}
        onPointSelect={index => setSelectedDuration(points[index]!.seconds)} />
      <label className="activity-benchmark-duration" htmlFor={id}><Text variant="bodySmall" tone="secondary">{t("benchmark.duration")}</Text><Select id={id} value={selected.seconds} onChange={event => setSelectedDuration(Number(event.target.value))}>{points.map(point => <option key={point.key} value={point.seconds}>{duration(point.seconds)}</option>)}</Select></label>
      <div className="activity-benchmark-values"><Stat compact label={t("benchmark.current")} value={selected.watts.toFixed(0)} unit="W" /><Stat compact label={t("benchmark.reference")} value={selected.referenceWatts.toFixed(0)} unit="W" /></div>
      <Text as="p" variant="bodySmall" tone="secondary">{t("benchmark.difference", { gap: `${gap > 0 ? "+" : ""}${gap}`, fraction: fraction.toFixed(1) })}</Text>
      <LocalizedLink className="activity-benchmark-source" to={`/activity/${encodeURIComponent(selected.activityId)}`}>{t("benchmark.source", { date: selected.date })}</LocalizedLink>
    </ChartFrame>
    <Text as="p" variant="bodySmall" tone="secondary">{t("benchmark.timingShort")}</Text>
    <Disclosure title={t("benchmark.readingGuide")}>
      <div className="space-y-3">
        <Text as="p" variant="bodySmall" tone="secondary">{t("benchmark.timingNote")}</Text>
        <Text as="p" variant="bodySmall" tone="secondary">{t("benchmark.curveNote")}</Text>
      </div>
    </Disclosure>
  </div>;
}
function LazyBenchmark({ ownerUid, metrics, defaultExpanded }: { ownerUid: string; metrics: MetricsLike | null; defaultExpanded?: boolean }) {
  const state = usePdc(ownerUid);
  return <BenchmarkReading metrics={metrics} state={state} defaultExpanded={defaultExpanded} />;
}
function BenchmarkSection({ ownerUid, metrics, suppliedPdcState, defaultExpanded = false, embedded = false }: ActivityPersonalBenchmarkProps & { ownerUid: string }) {
  const { t } = useTranslation("activity");
  const [opened, setOpened] = useState(defaultExpanded);
  const [mounted, setMounted] = useState(defaultExpanded);
  const id = useId();
  if (embedded) return suppliedPdcState ? <BenchmarkReading metrics={metrics} state={suppliedPdcState} /> : <LazyBenchmark metrics={metrics} ownerUid={ownerUid} />;
  return <section className="activity-personal-benchmark space-y-3">
    <h3 className="activity-analysis-tool-heading"><Button variant="ghost" size="sm" aria-expanded={opened} aria-controls={id} onClick={() => { setOpened(value => !value); setMounted(true); }}><Text variant="bodyMedium" weight={600}>{t("benchmark.title")}</Text>{opened ? <ChevronUp aria-hidden="true" size={ICON_SIZE.md} /> : <ChevronDown aria-hidden="true" size={ICON_SIZE.md} />}</Button></h3>
    {mounted && <div id={id} hidden={!opened}>{suppliedPdcState ? <BenchmarkReading metrics={metrics} state={suppliedPdcState} defaultExpanded={defaultExpanded} /> : <LazyBenchmark metrics={metrics} ownerUid={ownerUid} defaultExpanded={defaultExpanded} />}</div>}
  </section>;
}
export function ActivityPersonalBenchmark(props: ActivityPersonalBenchmarkProps) {
  const { user } = useAuth();
  const { firestore } = useFirebaseServices();
  if (!props.ownerUid || user?.uid !== props.ownerUid || props.sport !== "bike") return null;
  const key = `${props.ownerUid}:${props.activityId}:${firestore?.app?.name}:${firestore?.app?.options.projectId}`;
  return <BenchmarkSection key={key} {...props} ownerUid={props.ownerUid} />;
}
