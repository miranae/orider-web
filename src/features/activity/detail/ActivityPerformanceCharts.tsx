import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocale } from "../../../contexts/LocaleContext";
import ElevationChart, { type OverlayDataset } from "../../../components/ElevationChart";
import { ActivityZoneTimeline } from "../../../components/activity/ActivityZoneTimeline";
import { Card } from "../../../theme/components";
import { formatDistance } from "../../../utils/units";
import { runningCadenceSpm } from "../../../utils/runningCadence";
import type { OverlayConfig, SampledPoint } from "./activityDetailUtils";
import type { buildSummaryStats } from "./activityDetailDerived";
import type { ActivityAnalysisModel } from "../../../hooks/useActivityAnalysisModel";

interface ActivityPerformanceChartsProps {
  rangeControls?: ReactNode;
  rangeAnalysis?: ReactNode;
  elapsedAxisSec?: readonly number[];
  xAxis?: "distance" | "elapsed";
  elevData: Array<{ distance: number; elevation: number }>;
  availableOverlays: OverlayConfig[];
  activeOverlays: Set<string>;
  focusedOverlayKey: string | null;
  toggleOverlay: (key: string) => void;
  chartOverlays: OverlayDataset[];
  hoverPoint: SampledPoint | null;
  summaryStats: ReturnType<typeof buildSummaryStats>;
  sport: string;
  recordedRunCadenceUnit: Parameters<typeof runningCadenceSpm>[1];
  onHoverIndex?: (index: number | null) => void;
  chartHighlightRange?: [number, number];
  hasElevation?: boolean;
  range?: [number, number];
  onRangeChange?: (range: [number, number]) => void;
  metrics: ActivityAnalysisModel["serverMetrics"]["metrics"];
  powerSource?: NonNullable<ActivityAnalysisModel["streamSensorSummary"]>["powerSource"];
}

/** 공유 웹/임베드 차트. 표본 선택·단위·서버 구간 계약은 기존 상세 모델을 그대로 사용한다. */
export default function ActivityPerformanceCharts({
  elevData, availableOverlays, activeOverlays, focusedOverlayKey, toggleOverlay,
  chartOverlays, hoverPoint, summaryStats, sport, recordedRunCadenceUnit,
  onHoverIndex, chartHighlightRange, metrics, powerSource, hasElevation = true, range, onRangeChange,
  rangeControls, rangeAnalysis, elapsedAxisSec, xAxis,
}: ActivityPerformanceChartsProps) {
  const { t } = useTranslation("activity");
  const { units } = useLocale();
  const hasStreams = elevData.length > 0;
  const focusedOverlay = availableOverlays.find(cfg => cfg.key === focusedOverlayKey) ?? null;
  const overlayLabel = (cfg: OverlayConfig) => cfg.key === "power" && powerSource
    ? t(powerSource === "watts_calc" || powerSource === "virtualPowerOverride" ? "page.chartVirtualPower" : "page.chartMeasuredPower")
    : t(`overlay.${cfg.label}`);
  return (
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>
            {!hasElevation ? t("page.detailedCharts") : availableOverlays.length > 0 ? t("page.elevTitleWithPerf") : t("page.elevProfile")}
          </h3>

          {/* Overlay toggle buttons */}
          {hasStreams && availableOverlays.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {hasElevation && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[length:var(--fs-xs)] font-medium rounded-full cursor-default" style={{ background: 'color-mix(in srgb, var(--lime) 12%, transparent)', color: 'var(--lime)', border: '1px solid color-mix(in srgb, var(--lime) 30%, transparent)' }}>
                <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
                {t("page.elevation")}
              </span>}
              {availableOverlays.map((cfg) => (
                <button
                  key={cfg.key}
                  onClick={() => toggleOverlay(cfg.key)}
                  aria-pressed={activeOverlays.has(cfg.key)}
                  aria-label={`${overlayLabel(cfg)}${cfg.key === focusedOverlayKey ? `, ${t("page.chartCurrentScale", { metric: overlayLabel(cfg) })}` : ""}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[length:var(--fs-xs)] font-medium rounded-full border transition-colors"
                  style={activeOverlays.has(cfg.key) ? {
                    color: cfg.dotColor,
                    borderColor: cfg.dotColor,
                    backgroundColor: `${cfg.dotColor}15`,
                  } : {
                    background: 'var(--bg-2)',
                    color: 'var(--ink-3)',
                    borderColor: 'var(--line-soft)',
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: activeOverlays.has(cfg.key) ? cfg.dotColor : "var(--ink-4)" }}
                  />
                  {overlayLabel(cfg)}{cfg.formatValue && <span className="ml-1">{cfg.unit}</span>}
                </button>
              ))}
            </div>
          )}
          {focusedOverlay && <p className="sr-only" aria-live="polite">{t("page.chartCurrentScale", { metric: overlayLabel(focusedOverlay) })}</p>}
          {/* Hover data panel */}
          {hasStreams && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-xs)] mb-2 min-h-[var(--space-5)]" style={{ color: 'var(--ink-2)' }}>
              {hoverPoint ? (
                <>
                  <span className="font-medium" style={{ color: 'var(--ink-0)' }}>{formatDistance(hoverPoint.distance, units)}</span>
                  <span style={{ color: 'var(--line)' }}>|</span>
                  {hasElevation && <span style={{ color: "var(--color-success)" }}>{t("page.elevationLabel", { value: Math.round(hoverPoint.altitude) })}</span>}
                  {availableOverlays.flatMap((cfg) => {
                    if (!activeOverlays.has(cfg.key)) return [];
                    const val = cfg.getValue(hoverPoint);
                    if (val == null || val <= 0) return [];
                    return [
                      <span key={`${cfg.key}-sep`} style={{ color: 'var(--line)' }}>|</span>,
                      <span key={cfg.key} style={{ color: cfg.dotColor }}>
                        {overlayLabel(cfg)} {cfg.formatValue?.(val) ?? (cfg.key === "speed" ? val.toFixed(1) : Math.round(val))} {cfg.unit}
                      </span>,
                    ];
                  })}
                </>
              ) : summaryStats ? (
                <>
                  {hasElevation && <span style={{ color: "var(--color-success)" }}>{t("page.elevationRange", { min: Math.round(summaryStats.minElev), max: Math.round(summaryStats.maxElev) })}</span>}
                  {availableOverlays.flatMap((cfg) => {
                    const rawStat = summaryStats.overlays[cfg.key];
                    const stat = rawStat && sport === "run" && cfg.key === "speed" ? { ...rawStat, avg: rawStat.avg > 0 ? 60 / rawStat.avg * (units === "imperial" ? 1.609344 : 1) : 0 }
                      : rawStat && sport === "run" && cfg.key === "cadence" && recordedRunCadenceUnit != null ? { ...rawStat, avg: runningCadenceSpm(rawStat.avg, recordedRunCadenceUnit) ?? rawStat.avg } : rawStat;
                    if (!stat || !activeOverlays.has(cfg.key)) return [];
                    return [
                      <span key={`${cfg.key}-sep`} style={{ color: 'var(--line)' }}>|</span>,
                      <span key={cfg.key} style={{ color: cfg.dotColor }}>
                        {t("page.avgPrefix")} {cfg.formatValue?.(stat.avg) ?? (cfg.key === "speed" ? stat.avg.toFixed(1) : Math.round(stat.avg))} {cfg.unit}
                      </span>,
                    ];
                  })}
                </>
              ) : null}
            </div>
          )}

          {rangeControls}
          <ElevationChart
            elapsedAxisSec={elapsedAxisSec} xAxis={xAxis}
            data={elevData}
            height={!hasElevation ? 56 : chartOverlays.length > 0 ? 150 : 200}
            showElevation={hasElevation}
            rangeMode={!!onRangeChange} range={range} onRangeChange={onRangeChange}
            onHoverIndex={hasStreams ? onHoverIndex : undefined}
            overlays={chartOverlays.length > 0 ? chartOverlays : undefined}
            focusedOverlayKey={focusedOverlayKey}
            separateOverlayLanes={chartOverlays.length > 0}
            highlightRange={chartHighlightRange}
          />
          {rangeAnalysis}
          <ActivityZoneTimeline metrics={metrics} />
        </Card>
  );
}
