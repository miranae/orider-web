import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityAnalysisModel } from "../../../hooks/useActivityAnalysisModel";
import { useLocale } from "../../../contexts/LocaleContext";
import type { RidePeakEffort } from "@shared/types/activity-metrics";
import { resolvePeakEffortLocation } from "./activityPeakEfforts";
import { Button } from "../../../theme/components";
import ActivityPerformanceCharts from "./ActivityPerformanceCharts";
import { StreamUnavailableCard } from "./ActivityDetailStates";
import { buildChartOverlays, buildSampledData, buildSummaryStats, selectChartOverlay } from "./activityDetailDerived";
import { getPerformanceOverlays } from "./activityPerformancePresentation";

/** 원시 스트림은 사용자가 상세 차트를 열 때만 기존 로더에 요청한다. */
export default function ActivityDetailedCharts({ model, highlightedPeak = null, onClearHighlightedPeak }: { model: ActivityAnalysisModel; highlightedPeak?: RidePeakEffort | null; onClearHighlightedPeak?: () => void }) {
  const { t } = useTranslation("activity");
  const { units } = useLocale();
  const [openedActivityId, setOpenedActivityId] = useState<string | null>(null);
  const [activeOverlays, setActiveOverlays] = useState<Set<string> | null>(null);
  const [focusedOverlayKey, setFocusedOverlayKey] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [range, setRange] = useState<[number, number] | undefined>();
  const [selectingRange, setSelectingRange] = useState(false);
  const activityId = model.activity?.id;
  const opened = !!activityId && (openedActivityId === activityId || highlightedPeak != null);
  const sampled = useMemo(() => buildSampledData(model.effectiveStreams, model.sensorSelectionContext),
    [model.effectiveStreams, model.sensorSelectionContext]);
  const cadenceUnit = model.serverMetrics?.metrics?.cadenceUnit
    ?? (model.activity?.source === "strava" ? "strides_per_minute" : model.activity?.source === "orider" ? "spm" : null);
  const available = useMemo(() => getPerformanceOverlays(sampled, model.sport, units, cadenceUnit, t("analysis.run.cadenceUnit")),
    [sampled, model.sport, units, cadenceUnit, t]);
  const selected = activeOverlays ?? new Set(available.slice(0, 2).map(cfg => cfg.key));
  const hasElevation = !!model.effectiveStreams?.altitude?.some(value => value != null && Number.isFinite(value));
  const overlays = buildChartOverlays(available, selected, sampled, label => label === "power" && model.streamSensorSummary?.powerSource
    ? t(model.streamSensorSummary?.powerSource === "watts_calc" || model.streamSensorSummary?.powerSource === "virtualPowerOverride"
      ? "page.chartVirtualPower" : "page.chartMeasuredPower") : t(`overlay.${label}`));
  if (!activityId || (model.sport !== "run" && model.sport !== "ride")) return null;
  return (
    <section className="space-y-4" aria-label={t("page.detailedCharts")}>
      <Button variant="outline" aria-expanded={opened} onClick={() => {
        if (opened) {
          setOpenedActivityId(null);
          onClearHighlightedPeak?.();
        }
        else {
          setOpenedActivityId(activityId);
          setActiveOverlays(null); setFocusedOverlayKey(null); setHoverIndex(null); setRange(undefined); setSelectingRange(false);
          if (!model.streams && !model.loadingStreams) model.requestStreams();
        }
      }}>{t(opened ? "page.hideDetailedCharts" : "page.detailedCharts")}</Button>
      {opened && (model.loadingStreams || model.showStreamSpinner) && <p role="status">{t("page.loadingGps")}</p>}
      {opened && !model.loadingStreams && !model.showStreamSpinner && (model.streamsError || !sampled.length) && (
        <StreamUnavailableCard title={t("page.detailedCharts")} message={model.streamsError ?? t("page.chartsUnavailable")}
          retryLabel={t("page.retry")} onRetry={() => { void model.retryStreams(); }} />
      )}
      {opened && sampled.length > 0 && <div className="space-y-2">
        <Button size="sm" variant="outline" aria-pressed={selectingRange} onClick={() => {
          setSelectingRange(value => !value); setRange(undefined);
        }}>{t(selectingRange ? "page.clearChartRange" : "page.selectChartRange")}</Button>
        {selectingRange && <p className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-2)" }}>{t("page.chartRangeHint")}</p>}
      </div>}
      {opened && sampled.length > 0 && <ActivityPerformanceCharts
        elevData={sampled.map(point => ({ distance: point.distance, elevation: point.altitude }))}
        availableOverlays={available} activeOverlays={selected} focusedOverlayKey={focusedOverlayKey}
        toggleOverlay={key => {
          const next = selectChartOverlay(selected, key);
          setActiveOverlays(next.activeOverlays); setFocusedOverlayKey(next.focusedOverlayKey);
        }}
        chartOverlays={overlays} hoverPoint={hoverIndex == null ? null : sampled[hoverIndex] ?? null}
        summaryStats={buildSummaryStats(model.effectiveStreams, model.streamSensorSummary)}
        sport={model.sport} recordedRunCadenceUnit={cadenceUnit} hasElevation={hasElevation}
        chartHighlightRange={resolvePeakEffortLocation(highlightedPeak, model.serverMetrics.metrics?.peakEfforts?.indexAxis, model.streams, sampled)?.chartRange}
        onHoverIndex={setHoverIndex} metrics={model.serverMetrics?.metrics} powerSource={model.streamSensorSummary?.powerSource}
        range={range ?? [0, sampled.length - 1]} onRangeChange={selectingRange ? setRange : undefined}
      />}
    </section>
  );
}
