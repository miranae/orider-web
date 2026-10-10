import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { RUN_DISTANCES, RUN_DISTANCE_M } from "@shared/types/personal-records";
import type { RunningBestEffortsFacts } from "@shared/types/running-best-efforts-facts";
import type { ActivityMetricsDoc } from "../../hooks/useActivityMetrics";
import { speedCurvePoints } from "../../features/activity/detail/metricsPresentation";
import { useLocale } from "../../contexts/LocaleContext";
import { Button, ChartFrame, Select, Stat, Text } from "../../theme";
import { formatPace } from "../../utils/units";

/** 확정 서버 값만 표시한다. 속도에서 거리별 최고 기록이나 위치를 추정하지 않는다. */
export default function RunEffortsPanel({ metrics, ready, facts, onSelectEffort }: { metrics: ActivityMetricsDoc; ready: boolean; facts?: RunningBestEffortsFacts; onSelectEffort?: (range: { startOffsetSec: number; endOffsetSec: number }) => void }) {
  const { t } = useTranslation("activity");
  const { units } = useLocale();
  const id = useId();
  const [duration, setDuration] = useState(300);
  const settled = ready && metrics.discipline === "run" && metrics.inputPending !== true && metrics.inputCoverage === "complete";
  const points = settled ? speedCurvePoints(metrics).filter(point => Number.isFinite(point.speedKmh) && point.speedKmh > 0) : [];
  const records = settled ? RUN_DISTANCES.flatMap(key => {
    const seconds = metrics.runMetrics?.distanceRecords?.[key];
    return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? [{ key, seconds }] : [];
  }) : [];
  const anchorFor = (key: keyof typeof RUN_DISTANCE_M, seconds: number) => settled && onSelectEffort && facts?.state === "available" ? facts.facts.find(fact => fact.distance === key && fact.elapsedSec === seconds && fact.endOffsetSec <= metrics.durationSec && fact.startOffsetSec >= 0) : undefined;
  const hasAnchors = records.some(record => !!anchorFor(record.key, record.seconds));
  const selected = points.find(point => point.durationSeconds === duration) ?? points[0];
  const pace = (speed: number) => formatPace(3600 / speed, units);
  const elapsed = (seconds: number) => {
    const rounded = Math.round(seconds);
    const hours = Math.floor(rounded / 3600);
    return `${hours ? `${hours}:` : ""}${String(Math.floor(rounded / 60) % 60).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
  };
  const durationLabel = (seconds: number) => seconds < 60 ? t("runEfforts.seconds", { count: seconds }) : t("runEfforts.minutes", { count: seconds / 60 });
  const low = Math.min(...points.map(point => point.speedKmh)), high = Math.max(...points.map(point => point.speedKmh));
  const x = (seconds: number) => points.length < 2 ? 180 : 36 + (Math.log(seconds) - Math.log(points[0]!.durationSeconds)) / (Math.log(points[points.length - 1]!.durationSeconds) - Math.log(points[0]!.durationSeconds)) * 288;
  const y = (speed: number) => 112 - (speed - low) / (high - low || 1) * 72;
  return <details className="rounded-[var(--r-lg)] border border-[var(--line-soft)] p-3" data-testid="run-efforts">
    <summary className="cursor-pointer font-semibold text-[length:var(--fs-sm)] py-3">{t("runEfforts.title")}</summary>
    <div className="space-y-4 pt-3">
      {!settled ? <Text as="p" variant="bodySmall" tone="secondary">{t("runEfforts.pending")}</Text> : <>
        <ChartFrame variant="embedded" header={<Text as="h3" variant="subtitle">{t("runEfforts.curveTitle")}</Text>}>
          {selected ? <div className="space-y-3">
            <svg viewBox="0 0 360 148" className="w-full font-mono text-[length:var(--fs-sm)]" role="img" aria-label={t("runEfforts.curveTitle")}>
              <line x1={36} x2={324} y1={112} y2={112} stroke="var(--grid-soft)" />
              <polyline points={points.map(point => `${x(point.durationSeconds)},${y(point.speedKmh)}`).join(" ")} fill="none" stroke="var(--chart-speed)" strokeWidth={2} />
              {points.map(point => <g key={point.durationSeconds}><circle cx={x(point.durationSeconds)} cy={y(point.speedKmh)} r={point === selected ? 5 : 3} fill="var(--chart-speed)" /><title>{durationLabel(point.durationSeconds)} · {pace(point.speedKmh)}</title></g>)}
              {[points[0]!, ...(points.length > 1 ? [points[points.length - 1]!] : [])].map(point => <text key={point.durationSeconds} x={x(point.durationSeconds)} y={138} textAnchor="middle" fill="var(--chart-grid-label)">{durationLabel(point.durationSeconds)}</text>)}
            </svg>
            <label className="flex flex-wrap items-center gap-3" htmlFor={id}><Text variant="bodySmall" tone="secondary">{t("runEfforts.duration")}</Text><Select id={id} value={selected.durationSeconds} onChange={event => setDuration(Number(event.target.value))}>{points.map(point => <option key={point.durationSeconds} value={point.durationSeconds}>{durationLabel(point.durationSeconds)}</option>)}</Select></label>
            <Stat compact label={durationLabel(selected.durationSeconds)} value={pace(selected.speedKmh)} />
          </div> : <Text as="p" variant="bodySmall" tone="secondary">{t("runEfforts.curveMissing")}</Text>}
        </ChartFrame>
        <section className="space-y-3">
          <Text as="h3" variant="subtitle">{t("runEfforts.distanceTitle")}</Text>
          {records.length ? <div className="overflow-x-auto"><table className="w-full text-[length:var(--fs-sm)] tabular-nums"><thead><tr><th scope="col" className="text-left py-2">{t("runEfforts.distance")}</th><th scope="col" className="text-right py-2">{t("runEfforts.elapsed")}</th><th scope="col" className="text-right py-2">{t("stat.avgPace")}</th>{hasAnchors && <th scope="col" className="text-right py-2">{t("runEfforts.selection")}</th>}</tr></thead><tbody>{records.map(record => <tr key={record.key} className="border-t border-[var(--line-soft)]"><th scope="row" className="text-left py-3 font-normal">{t(`runRecord.dist.${record.key}`)}</th><td className="text-right py-3 whitespace-nowrap">{elapsed(record.seconds)}</td><td className="text-right py-3 whitespace-nowrap">{formatPace(record.seconds / (RUN_DISTANCE_M[record.key] / 1000), units)}</td>{hasAnchors && <td className="text-right py-3">{anchorFor(record.key, record.seconds) && <Button variant="outline" onClick={() => { const fact = anchorFor(record.key, record.seconds); if (fact) onSelectEffort?.({ startOffsetSec: fact.startOffsetSec, endOffsetSec: fact.endOffsetSec }); }}>{t("runEfforts.selectEffort", { distance: t(`runRecord.dist.${record.key}`) })}</Button>}</td>}</tr>)}</tbody></table></div> : <Text as="p" variant="bodySmall" tone="secondary">{t("runEfforts.recordsMissing")}</Text>}
          <details className="text-[length:var(--fs-sm)]"><summary className="cursor-pointer py-3">{t("runEfforts.calculationBasis")}</summary><div className="space-y-2 pt-2">
            <Text as="p" variant="bodySmall" tone="secondary">{t("runEfforts.curveBasis")}</Text>
            <Text as="p" variant="bodySmall" tone="secondary">{t("runEfforts.elapsedBasis")}</Text>
            {!hasAnchors && <Text as="p" variant="bodySmall" tone="secondary">{t("runEfforts.locationMissing")}</Text>}
          </div></details>
        </section>
      </>}
    </div>
  </details>;
}
