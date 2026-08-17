import { useRef, useCallback, useState, useEffect } from "react";
import { Line } from "react-chartjs-2";
import type { ChartEvent, ActiveElement, Chart, Plugin } from "chart.js";
import { isDarkTheme, useTheme } from "../contexts/ThemeContext";
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

const crosshairPlugin: Plugin<"line"> = {
  id: "crosshair",
  beforeDraw(chart) {
    const active = chart.getActiveElements();
    const first = active[0];
    if (!first) return;
    const { x } = first.element;
    const area = chart.chartArea;
    if (!area) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = isDarkTheme() ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, area.top);
    ctx.lineTo(x, area.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

/**
 * Plugin to draw a highlighted range region on the chart with draggable handles.
 */
const rangeHighlightPlugin: Plugin<"line"> = {
  id: "rangeHighlight",
  afterDatasetsDraw(chart) {
    const opts = (chart.options.plugins as Record<string, unknown>)?.rangeHighlight as
      | { start: number; end: number }
      | undefined;
    if (!opts) return;
    const { start, end } = opts;
    const area = chart.chartArea;
    if (!area) return;
    const xScale = chart.scales.x;
    if (!xScale) return;

    const x1 = xScale.getPixelForValue(start);
    const x2 = xScale.getPixelForValue(end);
    // Use min/max for dim regions (handles can cross for reverse direction)
    const xLeft = Math.min(x1, x2);
    const xRight = Math.max(x1, x2);

    const ctx = chart.ctx;
    ctx.save();

    // Dim regions outside the range
    const dark = isDarkTheme();
    ctx.fillStyle = dark ? "rgba(0, 0, 0, 0.4)" : "rgba(0, 0, 0, 0.15)";
    ctx.fillRect(area.left, area.top, xLeft - area.left, area.bottom - area.top);
    ctx.fillRect(xRight, area.top, area.right - xRight, area.bottom - area.top);

    // Draw start line (green) — always at start position
    ctx.strokeStyle = "#16A34A";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1, area.top);
    ctx.lineTo(x1, area.bottom);
    ctx.stroke();

    // Draw end line (red) — always at end position
    ctx.strokeStyle = "#DC2626";
    ctx.beginPath();
    ctx.moveTo(x2, area.top);
    ctx.lineTo(x2, area.bottom);
    ctx.stroke();

    // Draw direction arrow between handles if reversed (start > end → arrow points left)
    if (start > end) {
      const midX = (x1 + x2) / 2;
      const midY = area.top + 10;
      ctx.fillStyle = dark ? "rgba(249, 115, 22, 0.7)" : "rgba(249, 115, 22, 0.5)";
      ctx.beginPath();
      ctx.moveTo(midX - 6, midY);
      ctx.lineTo(midX + 4, midY - 5);
      ctx.lineTo(midX + 4, midY + 5);
      ctx.closePath();
      ctx.fill();
    }

    // Draw drag handle — start (green circle at top)
    ctx.fillStyle = "#16A34A";
    ctx.beginPath();
    ctx.arc(x1, area.top + 10, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x1, area.top + 10, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Draw drag handle — end (red circle at top)
    ctx.fillStyle = "#DC2626";
    ctx.beginPath();
    ctx.arc(x2, area.top + 10, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x2, area.top + 10, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  },
};

/** Read-only segment highlight plugin — dims outside regions, no drag handles */
const segmentHighlightPlugin: Plugin<"line"> = {
  id: "segmentHighlight",
  afterDatasetsDraw(chart) {
    const opts = (chart.options.plugins as Record<string, unknown>)?.segmentHighlight as
      | { start: number; end: number }
      | undefined;
    if (!opts) return;
    const { start, end } = opts;
    const area = chart.chartArea;
    if (!area) return;
    const xScale = chart.scales.x;
    if (!xScale) return;

    const x1 = xScale.getPixelForValue(Math.min(start, end));
    const x2 = xScale.getPixelForValue(Math.max(start, end));

    const ctx = chart.ctx;
    ctx.save();

    // Dim regions outside the range
    const dark = isDarkTheme();
    ctx.fillStyle = dark ? "rgba(0, 0, 0, 0.4)" : "rgba(0, 0, 0, 0.12)";
    ctx.fillRect(area.left, area.top, x1 - area.left, area.bottom - area.top);
    ctx.fillRect(x2, area.top, area.right - x2, area.bottom - area.top);

    // Green start line
    ctx.strokeStyle = "#16A34A";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1, area.top);
    ctx.lineTo(x1, area.bottom);
    ctx.stroke();

    // Red end line
    ctx.strokeStyle = "#DC2626";
    ctx.beginPath();
    ctx.moveTo(x2, area.top);
    ctx.lineTo(x2, area.bottom);
    ctx.stroke();

    ctx.restore();
  },
};

export interface OverlayDataset {
  key?: string;
  label: string;
  data: Array<number | null>;
  color: string;
  yAxisID: string;
  unit?: string;
}

interface OverlayChartPoint {
  x: number;
  y: number | null;
}

export function buildFiniteOverlayPoints(
  values: readonly (number | null)[],
  distancesKm: readonly (number | undefined)[],
): OverlayChartPoint[] {
  return values
    .map((y, index) => ({ x: distancesKm[index], y }))
    .filter((point): point is OverlayChartPoint => Number.isFinite(point.x)
      && (point.y === null || Number.isFinite(point.y)));
}

/** 경사 구간 색상. 캔버스는 CSS 변수를 못 읽으므로 그릴 때 토큰을 실제 값으로 읽는다. */
const GRADE_BANDS = [
  { maxGradePct: 3, variable: "--color-info", fallbackDark: "oklch(0.78 0.13 210)", fallbackLight: "oklch(0.55 0.13 210)" },
  { maxGradePct: 7, variable: "--color-warning", fallbackDark: "oklch(0.80 0.14 75)", fallbackLight: "oklch(0.66 0.15 75)" },
  { maxGradePct: Infinity, variable: "--color-error", fallbackDark: "oklch(0.72 0.16 20)", fallbackLight: "oklch(0.58 0.17 20)" },
] as const;

export function readGradeBandColors(dark: boolean): string[] {
  const root = typeof document === "undefined" ? null : document.documentElement;
  return GRADE_BANDS.map((band) => {
    const fallback = dark ? band.fallbackDark : band.fallbackLight;
    if (!root) return fallback;
    return getComputedStyle(root).getPropertyValue(band.variable).trim() || fallback;
  });
}

/** 두 표본 사이의 경사(%). 거리가 0이면 0으로 본다. */
export function segmentGradePct(
  from: { distance: number; elevation: number },
  to: { distance: number; elevation: number },
): number {
  const deltaDistance = to.distance - from.distance;
  if (!(deltaDistance > 0)) return 0;
  return Math.abs(((to.elevation - from.elevation) / deltaDistance) * 100);
}

export function gradeBandIndex(gradePct: number): number {
  return GRADE_BANDS.findIndex((band) => gradePct < band.maxGradePct);
}

export interface ElevationChartMarker {
  distance: number;
  elevation: number;
  color: string;
  label?: string;
  active?: boolean;
}

interface ElevationChartProps {
  data: { distance: number; elevation: number }[];
  height?: number;
  onHoverIndex?: (index: number | null) => void;
  overlays?: OverlayDataset[];
  /** 강조할 성능 지표. 해당 지표의 축과 선을 선명하게 표시한다. */
  focusedOverlayKey?: string | null;
  /** 서로 다른 단위의 성능 지표를 별도 레인으로 표시한다. */
  separateOverlayLanes?: boolean;
  /** Enable range selection mode */
  rangeMode?: boolean;
  /** Current selected range [startIndex, endIndex] */
  range?: [number, number];
  /** Callback when range changes (via chart drag or external) */
  onRangeChange?: (range: [number, number]) => void;
  /**
   * 경사 구간을 색으로 구분한다. 프로필은 폭에 따라 종횡이 왜곡되므로 가파름을 형상만으로는
   * 읽기 어렵다. 색이 실제 경사를 함께 전달한다. 기본값 off — 켜는 화면만 바뀐다.
   */
  colorByGrade?: boolean;
  /**
   * 프로필 위에 찍을 지점(경유지 등). 거리는 m, 색은 캔버스가 그릴 수 있는 실제 값이어야
   * 한다(CSS 변수는 해석하지 못한다). `active` 인 지점은 크게 그린다.
   */
  markers?: ElevationChartMarker[];
  /** Read-only segment highlight range [startIndex, endIndex] (no drag) */
  highlightRange?: [number, number];
}

export default function ElevationChart({
  data,
  height = 180,
  onHoverIndex,
  overlays,
  focusedOverlayKey,
  separateOverlayLanes = false,
  rangeMode,
  range,
  onRangeChange,
  highlightRange,
  colorByGrade = false,
  markers,
}: ElevationChartProps) {
   
  const chartRef = useRef<Chart<"line", any>>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dragTarget, setDragTarget] = useState<"start" | "end" | null>(null);
  // 테마 변경 시 차트 옵션 재계산 (플러그인이 isDarkTheme를 새로 읽도록)
  const { resolvedTheme } = useTheme();

  // For Ctrl+drag fine control
  const lastDragClientX = useRef(0);
  const accumulatedDelta = useRef(0);

  // Convert data index to km value for LinearScale
  const indexToKm = useCallback((idx: number): number => {
    if (data.length === 0) return 0;
    const clamped = Math.max(0, Math.min(data.length - 1, idx));
    return data[clamped]!.distance / 1000;
  }, [data]);

  // Convert pixel X to data index (via km value → nearest point)
  const pixelToIndex = useCallback((clientX: number): number | null => {
    const chart = chartRef.current;
    if (!chart || data.length === 0) return null;
    const rect = chart.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const xScale = chart.scales.x;
    if (!xScale) return null;
    const kmVal = xScale.getValueForPixel(x);
    if (kmVal == null) return null;
    // 가장 가까운 데이터 포인트 인덱스 찾기
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < data.length; i++) {
      const diff = Math.abs(data[i]!.distance / 1000 - kmVal);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    return best;
  }, [data]);

  // Check proximity to a handle (returns 'start' | 'end' | null)
  const getHandleNear = useCallback((clientX: number): "start" | "end" | null => {
    const chart = chartRef.current;
    if (!chart || !range) return null;
    const rect = chart.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const xScale = chart.scales.x;
    if (!xScale) return null;

    const startPx = xScale.getPixelForValue(indexToKm(range[0]));
    const endPx = xScale.getPixelForValue(indexToKm(range[1]));
    const threshold = 12;

    if (Math.abs(x - startPx) < threshold) return "start";
    if (Math.abs(x - endPx) < threshold) return "end";
    return null;
  }, [range, indexToKm]);

  // Pointer down — start drag if near a handle.
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!rangeMode || !range || !onRangeChange) return;
    const handle = getHandleNear(e.clientX);
    if (handle) {
      setDragTarget(handle);
      lastDragClientX.current = e.clientX;
      accumulatedDelta.current = 0;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }
  }, [rangeMode, range, onRangeChange, getHandleNear]);

  // Pointer move — update range while dragging, update cursor, or scrub hover on touch.
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!rangeMode || !range || !onRangeChange) {
      if (!dragTarget && onHoverIndex) {
        onHoverIndex(pixelToIndex(e.clientX));
      }
      return;
    }

    // Update cursor on hover near handles
    if (!dragTarget) {
      const handle = getHandleNear(e.clientX);
      const el = wrapperRef.current;
      if (el) {
        el.style.cursor = handle ? "col-resize" : "";
      }
      return;
    }

    // Ctrl/Cmd held → fine control (10px per 1 index step)
    if (e.ctrlKey || e.metaKey) {
      const pixelDelta = e.clientX - lastDragClientX.current;
      lastDragClientX.current = e.clientX;
      accumulatedDelta.current += pixelDelta;

      const pxPerStep = 10;
      const steps = Math.trunc(accumulatedDelta.current / pxPerStep);
      if (steps !== 0) {
        accumulatedDelta.current -= steps * pxPerStep;
        const currentValue = dragTarget === "start" ? range[0] : range[1];
        const newValue = Math.max(0, Math.min(data.length - 1, currentValue + steps));
        if (dragTarget === "start") {
          onRangeChange([newValue, range[1]]);
        } else {
          onRangeChange([range[0], newValue]);
        }
      }
      return;
    }

    // Normal drag — handles can cross freely for reverse direction
    lastDragClientX.current = e.clientX;
    accumulatedDelta.current = 0;
    const idx = pixelToIndex(e.clientX);
    if (idx == null) return;

    if (dragTarget === "start") {
      onRangeChange([idx, range[1]]);
    } else {
      onRangeChange([range[0], idx]);
    }
  }, [rangeMode, range, onRangeChange, dragTarget, pixelToIndex, getHandleNear, data.length, onHoverIndex]);

  // Global pointerup to end drag even if the pointer leaves the chart.
  useEffect(() => {
    if (!dragTarget) return;
    const handleUp = () => setDragTarget(null);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [dragTarget]);

  // Suppress hover index during drag
  const handleHover = useCallback(
    (_event: ChartEvent, elements: ActiveElement[]) => {
      if (!onHoverIndex || dragTarget) return;
      if (elements.length > 0 && elements[0] != null) {
        onHoverIndex(elements[0].index);
      } else {
        onHoverIndex(null);
      }
    },
    [onHoverIndex, dragTarget],
  );

  const handleLeave = useCallback(() => {
    onHoverIndex?.(null);
    if (wrapperRef.current) wrapperRef.current.style.cursor = "";
  }, [onHoverIndex]);

  // Chart.js는 CSS 변수를 해석 못해서 테마별 실제 색상값을 직접 지정.
  const isDark = resolvedTheme === "dark";
  const tickColor = isDark ? "rgba(235,236,238,0.72)" : "rgba(20,22,26,0.72)";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const pointHoverBorder = isDark ? "rgba(28,30,34,1)" : "rgba(255,255,255,1)";

  // X축 값을 km 단위 숫자로 변환
  const distancesKm = data.map((d) => d.distance / 1000);
  // 세그먼트마다 다시 읽으면 수백 번 getComputedStyle 이 돈다. 한 번만 읽는다.
  const gradeColors = colorByGrade ? readGradeBandColors(isDark) : [];

  const elevationDataset = {
    label: "고도 (m)",
    data: data.map((d, i) => ({ x: distancesKm[i], y: d.elevation })),
    fill: true,
    backgroundColor: "rgba(199, 247, 58, 0.08)",
    borderColor: "#A9CC39",
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 5,
    pointHoverBackgroundColor: "#C7F73A",
    pointHoverBorderColor: pointHoverBorder,
    pointHoverBorderWidth: 2,
    tension: 0.4,
    yAxisID: "yElev",
    ...(colorByGrade ? {
      segment: {
        borderColor: (ctx: { p0DataIndex: number }) => {
          const from = data[ctx.p0DataIndex];
          const to = data[ctx.p0DataIndex + 1];
          if (!from || !to) return gradeColors[0];
          return gradeColors[gradeBandIndex(segmentGradePct(from, to))] ?? gradeColors[0];
        },
      },
    } : {}),
  };
  // 지점 표시는 선 없는 산점 데이터셋으로 얹는다. 같은 축을 쓰므로 거리·고도가 그대로 맞는다.
  const markerDataset = markers && markers.length > 0 ? {
    label: "지점",
    data: markers.map((marker) => ({ x: marker.distance / 1000, y: marker.elevation })),
    showLine: false,
    fill: false,
    borderWidth: 0,
    pointRadius: markers.map((marker) => (marker.active ? 8 : 5)),
    pointHoverRadius: markers.map((marker) => (marker.active ? 9 : 6)),
    pointBackgroundColor: markers.map((marker) => marker.color),
    pointBorderColor: pointHoverBorder,
    pointBorderWidth: 2,
    yAxisID: "yElev",
  } : null;

  const chartData = {
    labels: distancesKm,
    datasets: [
      elevationDataset,
      ...(markerDataset ? [markerDataset] : []),
      ...(separateOverlayLanes ? [] : (overlays ?? []).map((o) => {
        const focused = o.key != null && o.key === focusedOverlayKey;
        return {
        label: o.label,
        data: buildFiniteOverlayPoints(o.data, distancesKm),
        backgroundColor: "transparent",
        borderWidth: focused ? 2.5 : 1.25,
        borderDash: focused ? [] : [4, 3],
        borderColor: o.color,
        pointRadius: 0,
        tension: 0.3,
        fill: false,
        spanGaps: false,
        yAxisID: o.yAxisID,
        };
      })),
    ],
  };

  // Build dynamic scales for overlays
  const overlayScales: Record<string, object> = {};
  if (overlays && !separateOverlayLanes) {
    for (const o of overlays) {
      const focused = o.key != null && o.key === focusedOverlayKey;
      overlayScales[o.yAxisID] = {
        type: "linear" as const,
        position: "right" as const,
        display: focused,
        grid: { drawOnChartArea: false },
        border: { display: false },
        ticks: {
          color: o.color,
          font: { size: 11, weight: focused ? "600" : "400" },
          maxTicksLimit: 4,
          callback: (value: string | number) => `${value}${o.unit ? ` ${o.unit}` : ""}`,
        },
        title: focused && o.unit
          ? { display: true, text: o.unit, color: o.color, font: { size: 11, weight: "600" } }
          : { display: false },
      };
    }
  }

  const plugins = rangeMode
    ? [crosshairPlugin, rangeHighlightPlugin]
    : [crosshairPlugin, segmentHighlightPlugin];

  const rangeHighlightOpts = rangeMode && range
    ? { start: indexToKm(range[0]), end: indexToKm(range[1]) }
    : undefined;

  const segmentHighlightOpts = !rangeMode && highlightRange
    ? { start: indexToKm(highlightRange[0]), end: indexToKm(highlightRange[1]) }
    : undefined;
  const showLanes = separateOverlayLanes && (overlays?.length ?? 0) > 0;

  return (
    <div
      ref={wrapperRef}
      style={{ touchAction: rangeMode ? "none" : "pan-y", paddingBottom: showLanes ? 8 : 0 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={handleLeave}
      onPointerCancel={handleLeave}
    >
      <div style={{ height }}>
        <Line
          ref={chartRef}
          data={chartData}
          plugins={plugins}
          options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          onHover: handleHover,
          plugins: {
            // 툴팁은 기본적으로 끈다(호버 표시는 부모가 그린다). 다만 지점 마커는 이름을
            // 알 방법이 이것뿐이라, 마커가 있을 때만 마커 데이터셋에 한해 켠다.
            tooltip: markerDataset ? {
              enabled: true,
              filter: (item: { datasetIndex: number }) => item.datasetIndex === 1,
              displayColors: false,
              callbacks: {
                title: () => "",
                label: (item: { dataIndex: number; parsed: { y: number } }) => {
                  const marker = markers?.[item.dataIndex];
                  const elevation = `${Math.round(item.parsed.y)}m`;
                  return marker?.label ? `${marker.label} · ${elevation}` : elevation;
                },
              },
            } : { enabled: false },
            legend: { display: false },
            ...(rangeHighlightOpts ? { rangeHighlight: rangeHighlightOpts } : {}),
            ...(segmentHighlightOpts ? { segmentHighlight: segmentHighlightOpts } : {}),
          } as Record<string, unknown>,
          scales: {
            x: {
              type: "linear",
              min: 0,
              max: distancesKm.length > 0 ? distancesKm[distancesKm.length - 1] : undefined,
              grid: { display: false },
              ticks: {
                font: { size: 12 },
                color: tickColor,
                maxTicksLimit: 10,
                callback: (v) => `${Number(v).toFixed(1)}`,
              },
              title: { display: true, text: "km", font: { size: 12 }, color: tickColor },
            },
            yElev: {
              type: "linear",
              position: "left",
              afterFit: (scale: { width: number }) => { scale.width = 54; },
              grid: { color: gridColor },
              ticks: {
                font: { size: 12 },
                color: "rgba(199,247,58,0.6)",
                callback: (v) => `${v}m`,
              },
            },
            ...(showLanes ? {
              yElevSpacer: {
                type: "linear" as const,
                position: "right" as const,
                afterFit: (scale: { width: number }) => { scale.width = 54; },
                grid: { display: false }, border: { display: false },
                ticks: { color: "transparent", callback: () => "" },
              },
            } : {}),
            ...overlayScales,
          },
          }}
        />
      </div>
      {showLanes && overlays?.map((overlay) => {
        const focused = overlay.key === focusedOverlayKey;
        return (
          <div key={overlay.key ?? overlay.label} style={{ height: 84, marginTop: "var(--space-2)" }}>
            <Line
              data={{
                labels: distancesKm,
                datasets: [{
                  label: overlay.label,
                  data: buildFiniteOverlayPoints(overlay.data, distancesKm),
                  borderColor: overlay.color,
                  backgroundColor: "transparent",
                  borderWidth: focused ? 2.25 : 1.75,
                  pointRadius: 0,
                  pointHoverRadius: 4,
                  pointHoverBackgroundColor: overlay.color,
                  pointHoverBorderColor: pointHoverBorder,
                  pointHoverBorderWidth: 2,
                  tension: 0.3,
                  fill: false,
                  spanGaps: false,
                  yAxisID: "yMetric",
                }],
              }}
              plugins={[crosshairPlugin]}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                onHover: handleHover,
                plugins: { tooltip: { enabled: false }, legend: { display: false } },
                scales: {
                  x: { type: "linear", min: 0, max: distancesKm[distancesKm.length - 1], display: false },
                  yMetricSpacer: {
                    type: "linear", position: "left", afterFit: (scale: { width: number }) => { scale.width = 54; },
                    grid: { display: false }, border: { display: false }, ticks: { color: "transparent", callback: () => "" },
                  },
                  yMetric: {
                    type: "linear", position: "right", afterFit: (scale: { width: number }) => { scale.width = 54; }, grid: { color: gridColor }, border: { display: false },
                    ticks: { color: overlay.color, font: { size: 12, weight: "bold" }, maxTicksLimit: 3, callback: (value: string | number) => `${value} ${overlay.unit ?? ""}` },
                  },
                },
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
