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
  label: string;
  data: number[];
  color: string;
  yAxisID: string;
  unit?: string;
}

interface ElevationChartProps {
  data: { distance: number; elevation: number }[];
  height?: number;
  onHoverIndex?: (index: number | null) => void;
  overlays?: OverlayDataset[];
  /** Enable range selection mode */
  rangeMode?: boolean;
  /** Current selected range [startIndex, endIndex] */
  range?: [number, number];
  /** Callback when range changes (via chart drag or external) */
  onRangeChange?: (range: [number, number]) => void;
  /** Read-only segment highlight range [startIndex, endIndex] (no drag) */
  highlightRange?: [number, number];
}

export default function ElevationChart({
  data,
  height = 180,
  onHoverIndex,
  overlays,
  rangeMode,
  range,
  onRangeChange,
  highlightRange,
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

  // Mouse down — start drag if near a handle
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!rangeMode || !range || !onRangeChange) return;
    const handle = getHandleNear(e.clientX);
    if (handle) {
      setDragTarget(handle);
      lastDragClientX.current = e.clientX;
      accumulatedDelta.current = 0;
      e.preventDefault();
    }
  }, [rangeMode, range, onRangeChange, getHandleNear]);

  // Mouse move — update range while dragging, or update cursor
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!rangeMode || !range || !onRangeChange) return;

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
  }, [rangeMode, range, onRangeChange, dragTarget, pixelToIndex, getHandleNear, data.length]);

  // Global mouseup to end drag even if mouse leaves chart
  useEffect(() => {
    if (!dragTarget) return;
    const handleUp = () => setDragTarget(null);
    window.addEventListener("mouseup", handleUp);
    return () => window.removeEventListener("mouseup", handleUp);
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

  const chartData = {
    labels: distancesKm,
    datasets: [
      {
        label: "\uACE0\uB3C4 (m)",
        data: data.map((d, i) => ({ x: distancesKm[i], y: d.elevation })),
        fill: true,
        backgroundColor: "rgba(199, 247, 58, 0.12)",
        borderColor: "#C7F73A",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: "#C7F73A",
        pointHoverBorderColor: pointHoverBorder,
        pointHoverBorderWidth: 2,
        tension: 0.4,
        yAxisID: "yElev",
      },
      ...(overlays ?? []).map((o) => ({
        label: o.label,
        data: o.data.map((v, i) => ({ x: distancesKm[i], y: v })),
        borderColor: o.color,
        backgroundColor: "transparent",
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        fill: false,
        yAxisID: o.yAxisID,
      })),
    ],
  };

  // Build dynamic scales for overlays
  const overlayScales: Record<string, object> = {};
  if (overlays) {
    for (const o of overlays) {
      overlayScales[o.yAxisID] = {
        type: "linear" as const,
        position: "right" as const,
        display: false,
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

  return (
    <div
      ref={wrapperRef}
      style={{ height }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleLeave}
    >
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
            tooltip: { enabled: false },
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
                font: { size: 10 },
                color: tickColor,
                maxTicksLimit: 10,
                callback: (v) => `${Number(v).toFixed(1)}`,
              },
              title: { display: true, text: "km", font: { size: 10 }, color: tickColor },
            },
            yElev: {
              type: "linear",
              position: "left",
              grid: { color: gridColor },
              ticks: {
                font: { size: 10 },
                color: "rgba(199,247,58,0.6)",
                callback: (v) => `${v}m`,
              },
            },
            ...overlayScales,
          },
        }}
      />
    </div>
  );
}
