import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import ZoneTimeline from "../ZoneTimeline";
import type { ActivityMetricsDoc } from "../../hooks/useActivityMetrics";
import { resolveHrZone, resolvePowerZone } from "../../features/activity/detail/metricsPresentation";

interface ActivityZoneTimelineProps {
  metrics: ActivityMetricsDoc | null;
}

/**
 * 존 타임라인 — 서버 `renderSeries` 를 그린다 (#2437).
 *
 * 이전엔 스트림에서 센서 축을 고르고 이동 마스크를 걸고 존을 다시 판정했다(`AnalysisTab` 의
 * 선택 로직과 중복). 축 선택·이동 필터·존 경계는 서버가 정했고, 여기는 축약 시계열에 색만
 * 입힌다. 값이 없으면 그리지 않는다 — 스트림에서 다시 만들지 않는다.
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
    const hr = axisOf(render.axes.heartrate);
    const power = axisOf(render.axes.watts);
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
  if (series.length === 0) return null;
  return <ZoneTimeline series={series} movingDurationSec={metrics?.movingTimeSec} />;
}
