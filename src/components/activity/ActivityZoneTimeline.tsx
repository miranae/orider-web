import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "../../theme/components";
import ZoneTimeline from "../ZoneTimeline";
import type { ActivityMetricsDoc } from "../../hooks/useActivityMetrics";
import { resolveHrZone, resolvePowerZone } from "../../features/activity/detail/metricsPresentation";

interface ActivityZoneTimelineProps {
  metrics: ActivityMetricsDoc | null;
}

/**
 * 존 타임라인 — 서버 `renderSeries` 를 그린다 (#2437).
 *
 * 저장된 축약 값의 강도 변화를 표시한다. 원본 시간/moving mask가 없으므로
 * 결측·휴식이 포함된 분모를 전체 시간에 균등 재배분하지 않는다.
 * 완전 분모에서도 축약 시각화이며 정확한 구간별 존 체류 시간을 주장하지 않는다.
 */
export function ActivityZoneTimeline({ metrics }: ActivityZoneTimelineProps) {
  const { t } = useTranslation("activity");
  const series = useMemo(() => {
    const render = metrics?.renderSeries;
    if (!metrics || !render || !render.axes) return [];
    const totalSec = metrics.durationSec > 0 ? metrics.durationSec : render.resolution;
    const axisOf = (values: Array<number | null> | undefined) => {
      if (!values || values.length === 0) return null;
      const step = totalSec / values.length;
      const kept: number[] = [];
      const time: number[] = [];
      values.forEach((v, i) => { if (typeof v === "number" && Number.isFinite(v)) { kept.push(v); time.push(i * step); } });
      return kept.length > 0 ? { values: kept, time, timing: { durationsSec: Array(kept.length).fill(step) } } : null;
    };
    // renderSeries has no per-point observation/moving clock. A partial zone
    // denominator cannot be located by spreading samples over the whole ride.
    const completeCoverage = (zones: number[] | undefined) => Array.isArray(zones) && zones.length > 0
      && zones.every(value => Number.isFinite(value) && value >= 0)
      && Number.isFinite(metrics.movingTimeSec) && metrics.movingTimeSec === totalSec
      && Math.abs(zones.reduce((sum, value) => sum + value, 0) - totalSec) < 1e-6;
    const hr = completeCoverage(metrics.hrZoneSec) ? axisOf(render.axes.heartrate) : null;
    const power = completeCoverage(metrics.powerZoneSec) ? axisOf(render.axes.watts) : null;
    const ftp = metrics.contextSnapshot?.ftp;
    return [
      ...(hr && metrics.hrZoneBoundaries ? [{
        id: "hr" as const, label: t("analysis.zones.hr"), ...hr,
        resolveZone: (value: number) => resolveHrZone(value, metrics), maxZone: metrics.hrZoneBoundaries.zones.length,
      }] : []),
      ...(power && ftp ? [{
        id: "power" as const, label: t("analysis.zones.power"), ...power,
        resolveZone: (value: number) => resolvePowerZone(value, ftp), maxZone: 7,
      }] : []),
    ];
  }, [metrics, t]);
  const axes = metrics?.renderSeries?.axes;
  const hasObservedAxis = [axes?.heartrate, axes?.watts].filter(values => values?.some(value => typeof value === "number" && Number.isFinite(value))).length;
  if (hasObservedAxis === 0) return null;
  return <>
    {series.length > 0 && <ZoneTimeline series={series} movingDurationSec={metrics?.movingTimeSec} />}
    {series.length < hasObservedAxis && <Text as="p" variant="bodySmall" tone="secondary">{t("analysis.zones.timelineCoverageUnavailable")}</Text>}
  </>;
}
