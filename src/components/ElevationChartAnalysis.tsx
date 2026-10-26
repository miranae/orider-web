import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Line } from "react-chartjs-2";
import type { Chart, Plugin } from "chart.js";
import { useOriderTheme } from "../theme";
import { useLocale } from "../contexts/LocaleContext";
import { LocalizedLink as Link } from "./LocalizedLink";
import { ChartTooltip } from "../theme/components/Chart";
import { formatElapsedBoundary } from "../features/activity/detail/activityRangeSelection";
import { Text } from "../theme/components";
import { ACTIVITY_ANALYSIS_PRESENTATION } from "../theme/charts/chartPresentation";
import { analysisCoordinates, analysisDomain, analysisPlotPoints, analysisObservedElevationPoints, nearestAnalysisIndex, orderedChartRange } from "./analysisChartCoordinates";
import type { ElevationChartProps } from "./ElevationChart";
import "../theme/charts/analysisTimeline.css";

export interface AnalysisLaneLabel { maximumLabel?: string; averageLabel?: ReactNode; label: string; maximum: string; average?: string; current: string; unit: string; formatScale?: (value: number) => string }
export interface AnalysisChartPresentation {
  /** raw_parts 고도 관측의 실제 경과 시각. 모든 값은 차트의 표본 인덱스와 대응한다. */
  elevationObservationTimeSec?: readonly number[];
  identity?: string;
  lanes: Record<string, AnalysisLaneLabel>;
  elevation: AnalysisLaneLabel;
  maximumLabel: string;
  averageLabel: ReactNode;
  keyboardLabel: string;
  segmentsLabel: string;
  segmentDetailsLabel: string;
  canonicalRange?: [number, number];
  hoverIndex?: number | null;
  visualRange?: [number, number] | null;
  onVisualRangeChange?: (range: [number, number] | null) => void;
  axisControls?: ReactNode;
  controls?: ReactNode;
  selectionCaption?: ReactNode;
  /** 선택이 없을 때 같은 자리에 보이는 안내. 선택 여부와 상관없이 높이를 유지한다. */
  selectionHint?: string;
  segments?: readonly { id: string | number; name: string; startIndex: number; endIndex: number; summary?: string; href?: string }[];
}

/** Activity-only viewport. Raw sample indices and canonical selection remain outside this renderer. */
export default function ElevationChartAnalysis({ data, overlays = [], elapsedAxisSec, xAxis, rangeMode, range, onRangeChange, onHoverIndex, showElevation = true, analysisPresentation: p }: ElevationChartProps & { analysisPresentation: AnalysisChartPresentation }) {
  const { variant } = useOriderTheme();
  const { units } = useLocale();
  const coordinate = analysisCoordinates(data, elapsedAxisSec, xAxis === "elapsed", units === "imperial");
  const axis = coordinate.values;
  const selected = orderedChartRange(p.visualRange, data.length);
  const domain = analysisDomain(axis, selected);
  const fullDomain = analysisDomain(axis);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(0);
  useEffect(() => {
    const plot = timelineRef.current?.querySelector<HTMLElement>(".analysis-timeline-plot");
    if (!plot) return;
    const measure = () => setPlotWidth(plot.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure); observer.observe(plot);
    return () => observer.disconnect();
  }, [showElevation]);
  const tickCount = Math.max(2, Math.min(6, Math.floor(plotWidth / 60) + 1));
  const [segmentHover, setSegmentHover] = useState<string | number | null>(null);
  const segmentTooltipId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const hoverIndex = p.hoverIndex !== undefined ? p.hoverIndex : hover;
  const drag = useRef<{ start: number; clientX: number; rect: DOMRect; domain: [number, number]; range: [number, number] | null } | null>(null);
  const ownerDrag = useRef<{ side: 0 | 1; clientX: number; delta: number; rect: DOMRect } | null>(null);
  const ownerMode = !!(rangeMode && range && onRangeChange);
  const interactive = ownerMode || Boolean(p.onVisualRangeChange);
  const activeSegmentRange = ownerMode ? range : selected;
  const activeSegment = p.segments?.find(segment => activeSegmentRange?.[0] === segment.startIndex && activeSegmentRange?.[1] === segment.endIndex) ?? null;
  // 세그먼트를 고르면 같은 한 줄 자리에 선택 구간 대신 세그먼트 이름·기록을 보여준다(줄을 더 만들지 않는다).
  const segmentSummary = activeSegment ? <div className="analysis-timeline-segment-summary">
        <>{/* 끝의 "구간" 링크 대신 세그먼트 이름이 상세로 간다. */}{activeSegment!.href ? <Link to={activeSegment!.href} aria-label={`${activeSegment!.name} · ${p.segmentDetailsLabel}`}><Text variant="bodySmall" weight={600}>{activeSegment!.name}</Text></Link> : <Text variant="bodySmall" weight={600}>{activeSegment!.name}</Text>}{activeSegment!.summary && <Text variant="caption">{activeSegment!.summary}</Text>}</>
      </div> : null;
  const suppressClick = useRef(false);
  const pinnedHover = useRef(false);
  const setPoint = (index: number | null) => { setHover(index); onHoverIndex?.(index); };
  const pointerIndex = (clientX: number, rect: DOMRect, view: [number, number], range: [number, number] | null) => nearestAnalysisIndex(axis, view[0] + Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width))) * (view[1] - view[0]), range);
  const finish = useCallback((event: PointerEvent) => {
    if (ownerDrag.current) { ownerDrag.current = null; suppressClick.current = true; return; }
    const current = drag.current;
    if (!current) return;
    drag.current = null; setDraft(null); suppressClick.current = true;
    const end = nearestAnalysisIndex(axis, current.domain[0] + Math.max(0, Math.min(1, (event.clientX - current.rect.left) / Math.max(1, current.rect.width))) * (current.domain[1] - current.domain[0]), current.range);
    const next = Math.abs(event.clientX - current.clientX) >= 4 && end !== null ? orderedChartRange([current.start, end], data.length) : null;
    pinnedHover.current = !!next;
    p.onVisualRangeChange?.(next);
    if (next && end !== null) { setHover(end); onHoverIndex?.(end); } else { setHover(null); onHoverIndex?.(null); }
  }, [axis, data.length, p, onHoverIndex]);
  useEffect(() => {
    const cancel = () => { ownerDrag.current = null; drag.current = null; setDraft(null); suppressClick.current = true; };
    window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", cancel); window.addEventListener("blur", cancel); window.addEventListener("scroll", cancel, true);
    return () => { window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", cancel); window.removeEventListener("scroll", cancel, true); };
  }, [finish]);
  useEffect(() => { ownerDrag.current = null; drag.current = null; setDraft(null); setHover(null); suppressClick.current = false; pinnedHover.current = false; }, [p.identity]);
  useEffect(() => { if (!p.visualRange) pinnedHover.current = false; }, [p.visualRange]);

  const maskRange = ownerMode ? orderedChartRange(range, data.length) : selected ?? orderedChartRange(p.canonicalRange, data.length);
  const frame = useRef({ axis, draft, selected: maskRange, hoverIndex, colors: variant.chartColors, length: data.length });
  frame.current = { axis, draft, selected: maskRange, hoverIndex, colors: variant.chartColors, length: data.length };
  const plugin = useRef<Plugin<"line">>({ id: "activityAnalysisCursor", afterDatasetsDraw(chart: Chart<"line">) {
    const { axis, draft, selected, hoverIndex, colors, length } = frame.current;
    const scale = chart.scales.x, area = chart.chartArea;
    if (!scale || !area) return;
    const ctx = chart.ctx;
    const mask = orderedChartRange(draft ?? selected, length);
    if (chart.data.datasets[0]?.label === "__overview" && mask) {
      const left = scale.getPixelForValue(axis[mask[0]]!), right = scale.getPixelForValue(axis[mask[1]]!);
      ctx.save(); ctx.fillStyle = colors.grid; ctx.globalAlpha = 0.5;
      ctx.fillRect(area.left, area.top, Math.max(0, left - area.left), area.bottom - area.top);
      ctx.fillRect(right, area.top, Math.max(0, area.right - right), area.bottom - area.top); ctx.restore();
    }
    const value = hoverIndex == null ? undefined : axis[hoverIndex];
    if (!Number.isFinite(value)) return;
    const x = scale.getPixelForValue(value!);
    if (x < area.left || x > area.right) return;
    ctx.save(); ctx.strokeStyle = colors.gridAxis; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, area.top); ctx.lineTo(x, area.bottom); ctx.stroke();
    const valueAtPoint = chart.data.datasets[0]?.data.find(point => typeof point === "object" && point !== null && (point as { sourceIndex?: number }).sourceIndex === hoverIndex) as { y?: number | null } | undefined;
    if (valueAtPoint?.y != null && Number.isFinite(valueAtPoint.y) && chart.scales.y) {
      ctx.beginPath(); ctx.fillStyle = chart.data.datasets[0]?.borderColor as string; ctx.arc(x, chart.scales.y.getPixelForValue(valueAtPoint.y), 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  } }).current;
  const label = (value: AnalysisLaneLabel) => <div className="analysis-timeline-label"><Text variant="bodySmall" weight={600}>{value.label}</Text><Text variant="caption" tone="tertiary">{value.maximumLabel ?? p.maximumLabel} {value.maximum}</Text>{value.average !== undefined && <Text variant="caption" tone="tertiary">{value.averageLabel ?? p.averageLabel} {value.average}</Text>}</div>;
  const options = (overview: boolean) => ({ responsive: true, maintainAspectRatio: false, animation: false as const, parsing: false as const,
    layout: { padding: 0 }, events: [], plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { type: "linear" as const, min: (overview ? fullDomain : domain)[0], max: (overview ? fullDomain : domain)[1], display: false },
      y: { display: false, grid: { display: false } } },
  });
  const plot = (key: string, values: readonly (number | null)[], color: string, overview: boolean, reverse = false) => {
    const view = overview ? fullDomain : domain;
    const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
    const yMin = finite.length ? Math.min(...finite) : 0, yMax = finite.length ? Math.max(...finite) : 1;
    const laneLabel = overview ? p.elevation : p.lanes[key];
    const formatScale = laneLabel?.formatScale ?? ((value: number) => String(Math.round(value)));
    return <><div className="analysis-timeline-plot" style={{ height: overview ? ACTIVITY_ANALYSIS_PRESENTATION.overviewHeight : ACTIVITY_ANALYSIS_PRESENTATION.metricHeight }}
      tabIndex={0} role="group" aria-label={`${overview ? p.elevation.label : p.lanes[key]?.label ?? key} · ${p.keyboardLabel}`}
      onPointerDown={event => {
        if (event.button !== 0) return;
        if (ownerMode && range) {
          if (!overview) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const position = (index: number) => rect.left + (axis[index]! - fullDomain[0]) / (fullDomain[1] - fullDomain[0]) * rect.width;
          const distances = range.map(index => Math.abs(event.clientX - position(index)));
          const side: 0 | 1 = distances[0]! <= distances[1]! ? 0 : 1;
          if (distances[side]! > 18) return;
          ownerDrag.current = { side, clientX: event.clientX, delta: 0, rect };
          event.currentTarget.setPointerCapture?.(event.pointerId); event.preventDefault(); return;
        }
        if (!p.onVisualRangeChange) return;
        const rect = event.currentTarget.getBoundingClientRect(), viewportRange = overview ? null : selected;
        const start = pointerIndex(event.clientX, rect, view, viewportRange);
        if (start === null) return;
        suppressClick.current = false; drag.current = { start, clientX: event.clientX, rect, domain: view, range: viewportRange };
        event.currentTarget.setPointerCapture?.(event.pointerId); event.preventDefault();
      }}
      onPointerMove={event => {
        const owner = ownerDrag.current;
        if (owner && range && onRangeChange) {
          let index: number | null;
          if (event.ctrlKey || event.metaKey) {
            owner.delta += event.clientX - owner.clientX;
            const steps = Math.trunc(owner.delta / 10);
            owner.delta -= steps * 10;
            index = Math.max(0, Math.min(data.length - 1, range[owner.side] + steps));
          } else { owner.delta = 0; index = pointerIndex(event.clientX, owner.rect, fullDomain, null); }
          owner.clientX = event.clientX;
          if (index !== null) { const next: [number, number] = [...range]; next[owner.side] = index; onRangeChange(next); }
          return;
        }
        const current = drag.current;
        const index = current ? pointerIndex(event.clientX, current.rect, current.domain, current.range) : pointerIndex(event.clientX, event.currentTarget.getBoundingClientRect(), view, overview ? null : selected);
        setPoint(index);
        if (current && index !== null) setDraft(orderedChartRange([current.start, index], data.length));
      }}
      onPointerLeave={() => { if (!drag.current && !pinnedHover.current) setPoint(null); }}
      onClick={() => { if (ownerMode) return; if (suppressClick.current) { suppressClick.current = false; return; } pinnedHover.current = false; setPoint(null); p.onVisualRangeChange?.(null); }}
      onKeyDown={event => {
        if (ownerMode && range && onRangeChange) {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault(); const side = event.shiftKey ? 0 : 1;
          const next: [number, number] = [...range];
          next[side] = Math.max(0, Math.min(data.length - 1, next[side] + (event.key === "ArrowLeft" ? -1 : 1)));
          if (next[0] < next[1]) onRangeChange(next);
          return;
        }
        if (event.key === "Escape") { event.preventDefault(); p.onVisualRangeChange?.(null); setPoint(null); return; }
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault(); const previous = hoverIndex ?? selected?.[0] ?? 0;
        const next = Math.max(0, Math.min(data.length - 1, previous + (event.key === "ArrowLeft" ? -1 : 1)));
        setPoint(next); if (event.shiftKey) p.onVisualRangeChange?.(orderedChartRange([selected?.[0] ?? previous, next], data.length));
      }}>
      {!overview && Array.from({ length: tickCount }, (_, index) => <span key={`grid-${index}`} aria-hidden="true" className="analysis-timeline-gridline" style={{ left: `${index / (tickCount - 1) * 100}%` }} />)}
      {overview && ownerMode && range && range.map((index, side) => <span key={side} aria-hidden="true" className="analysis-timeline-range-handle" style={{ left: `${(axis[index]! - fullDomain[0]) / (fullDomain[1] - fullDomain[0]) * 100}%` }} />)}
      <Line plugins={[plugin]} data={{ datasets: [{ label: overview ? "__overview" : key,
        data: overview && p.elevationObservationTimeSec
          ? analysisObservedElevationPoints(axis, values, p.elevationObservationTimeSec)
          : analysisPlotPoints(axis, values),
        borderColor: color, backgroundColor: overview ? variant.chartColors.grid : "transparent", fill: overview, borderWidth: overview ? 1 : 1.5,
        pointRadius: 0, tension: 0, spanGaps: false }] }} options={{ ...options(overview), scales: { ...options(overview).scales, y: { display: false, reverse, min: yMin, max: yMax > yMin ? yMax : yMin + 1 } } }} />
    </div><div aria-hidden="true" className="analysis-timeline-scale"><span>{formatScale(yMax)}</span><span>{formatScale(yMin)}</span></div></>;
  };
  return <div ref={timelineRef} className="analysis-timeline">
    {showElevation && <div className="analysis-timeline-row analysis-timeline-overview">{label(p.elevation)}{plot("elevation", data.map(point => point.elevation), variant.chartColors.gridAxis, true)}<Text variant="bodySmall" className="analysis-timeline-current">{p.elevation.current} {p.elevation.unit}</Text></div>}
    {/* 구간을 선택해도 고도 아래·지표 위 높이가 바뀌지 않도록 설명 자리를 항상 같은 높이로 둔다. */}
    {(interactive || p.selectionCaption) && <div className="analysis-timeline-row analysis-timeline-caption" data-selection={p.selectionCaption ? "active" : "idle"}>
      <div className="analysis-timeline-caption-slot">{activeSegment ? segmentSummary : p.selectionCaption ?? (p.selectionHint ? <Text variant="caption" tone="tertiary">{p.selectionHint}</Text> : null)}</div>
    </div>}
    {!!p.segments?.length && <>
      <div className="analysis-timeline-row analysis-timeline-segments-row"><span /><div className="analysis-timeline-segments" aria-label={p.segmentsLabel}>{p.segments.map(segment => {
        const start = axis[segment.startIndex], end = axis[segment.endIndex];
        if (!Number.isFinite(start) || !Number.isFinite(end) || end! <= start!) return null;
        const activeRange = ownerMode ? range : selected;
        const active = activeRange?.[0] === segment.startIndex && activeRange[1] === segment.endIndex;
        return <button type="button" key={segment.id} aria-label={`${segment.name}${segment.summary ? ` · ${segment.summary}` : ""}`} aria-pressed={active}
          aria-describedby={segmentHover === segment.id ? segmentTooltipId : undefined}
          onMouseEnter={() => setSegmentHover(segment.id)} onMouseLeave={() => setSegmentHover(null)} onFocus={() => setSegmentHover(segment.id)} onBlur={() => setSegmentHover(null)}
          onClick={() => { setSegmentHover(null); pinnedHover.current = true;
            if (ownerMode) onRangeChange?.([segment.startIndex, segment.endIndex]);
            else p.onVisualRangeChange?.([segment.startIndex, segment.endIndex]);
            setPoint(segment.endIndex); }} className="analysis-timeline-segment"
          style={{ left: `${(start! - fullDomain[0]) / (fullDomain[1] - fullDomain[0]) * 100}%`, width: `${(end! - start!) / (fullDomain[1] - fullDomain[0]) * 100}%` }}><span aria-hidden="true" /></button>;
      })}{p.segments.find(segment => segment.id === segmentHover) && <ChartTooltip id={segmentTooltipId} label={p.segments.find(segment => segment.id === segmentHover)!.name} style={{ bottom: "100%", left: 0 }}>{p.segments.find(segment => segment.id === segmentHover)!.summary}</ChartTooltip>}</div><span /><span /></div>
    </>}
    {p.controls && <div className="analysis-timeline-row analysis-timeline-toolbar"><div>{p.controls}</div></div>}
    <div className="analysis-timeline-row analysis-timeline-axis"><div className="analysis-timeline-axis-controls">{p.axisControls}</div><div aria-hidden="true" className="analysis-timeline-ticks">{Array.from({ length: tickCount }, (_, index) => <span key={index} style={{ left: `${index / (tickCount - 1) * 100}%`, transform: index === 0 ? undefined : index === tickCount - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>{coordinate.elapsed ? formatElapsedBoundary(Math.round((domain[0] + (domain[1] - domain[0]) * index / (tickCount - 1)) * 60)) : (domain[0] + (domain[1] - domain[0]) * index / (tickCount - 1)).toFixed(1)}</span>)}</div><Text variant="caption" aria-hidden="true" className="analysis-timeline-axis-unit">{coordinate.elapsed ? "" : units === "imperial" ? "mi" : "km"}</Text><span /></div>
    {overlays.map(overlay => <div key={overlay.key ?? overlay.label} className="analysis-timeline-row">{label(p.lanes[overlay.key ?? ""] ?? { label: overlay.label, maximum: "—", average: "—", current: "—", unit: overlay.unit ?? "" })}{plot(overlay.key ?? overlay.label, overlay.data, overlay.color, false, overlay.reverseAxis)}<div className="analysis-timeline-current"><Text variant="bodyMedium" weight={600}>{p.lanes[overlay.key ?? ""]?.current ?? "—"}</Text><Text variant="caption" tone="tertiary">{p.lanes[overlay.key ?? ""]?.unit ?? overlay.unit}</Text></div></div>)}
  </div>;
}
