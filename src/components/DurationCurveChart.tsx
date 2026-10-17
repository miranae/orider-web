import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Line } from "react-chartjs-2";
import type { ChartOptions, Plugin } from "chart.js";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";
import { formatNum } from "../utils/units";
import { useOriderTheme } from "../theme";
import { resolveCssColor } from "../utils/cssColor";
import ChartEmptyState from "./charts/ChartEmptyState";

ChartJS.register(CategoryScale, LinearScale, LogarithmicScale, PointElement, LineElement, Filler, Tooltip);

/**
 * 창 길이별 최고값 곡선 — 파워 커브와 속도 커브가 같은 모양을 쓴다.
 *
 * 두 커브는 서버에서 **같은 창 길이·같은 규약**(`bestWindowByTime`)으로 계산되므로,
 * 화면에서도 같은 축과 같은 읽는 법을 가져야 나란히 비교된다. 축 단위와 색만 다르다.
 */
export interface DurationCurvePoint {
  durationSeconds: number;
  value: number;
}

export interface DurationCurveChartProps {
  points: DurationCurvePoint[];
  /** y 축·툴팁에 붙는 단위. */
  unit: string;
  /** 소수점 자리. 파워는 0, 속도는 1. */
  fractionDigits?: number;
  color: string;
  datasetLabel: string;
  /** 기준선 (파워의 FTP 등). 없으면 그리지 않는다. */
  reference?: { value: number; label: string } | null;
  /** 좌상단 요약 문구. */
  peakLabel?: string;
  emptyTitle: string;
  emptyDescription: string;
  /**
   * 같은 창 길이에 겹쳐 그리는 비교 곡선(역대 최고 등). 값이 없는 창은 null 로 비운다 —
   * 화면이 비교값을 만들지 않는다.
   */
  comparison?: { label: string; values: Array<number | null>; color?: string } | null;
  /** 툴팁 아래에 붙는 줄(비교 % 등). 서버 값을 문구로만 바꾼다. */
  tooltipFooter?: (index: number) => string[];
  /** 선택적 직접 라벨 — 점 위에 짧은 글자를 그린다(전부 붙이지 않는다). */
  annotations?: Array<{ index: number; text: string }>;
  /** 캔버스의 접근 가능한 이름. 없으면 datasetLabel. */
  ariaLabel?: string;
  /** 플롯 높이 클래스. 기본 200px. */
  heightClassName?: string;
  /** 범례를 그린다(비교 곡선이 있을 때 색만으로 구분하지 않도록). */
  showLegend?: boolean;
  /**
   * `all` 은 측정한 창마다 x 라벨을 단다(좁은 차트에서는 짝수 번째와 마지막만).
   * 창이 몇 개 안 되는 요약 곡선용 — 어느 점이 몇 초인지 축에서 바로 읽힌다.
   */
  xTicks?: "auto" | "all";
  /** 단위를 눈금마다 붙이지 않고 y 축 제목에 한 번만 쓴다. */
  unitAxisTitle?: boolean;
  /** 기준선을 실선 hairline 으로(비교 곡선의 점선과 겹치지 않게). */
  referenceSolid?: boolean;
  /** 캔버스 그룹의 역할 설명(예: "차트")과 보조 설명 요소 id. */
  roleDescription?: string;
  describedBy?: string;
}

export default function DurationCurveChart({
  points, unit, fractionDigits = 0, color, datasetLabel,
  reference = null, peakLabel, emptyTitle, emptyDescription,
  comparison = null, tooltipFooter, annotations, ariaLabel, heightClassName = "h-[200px]", showLegend = false,
  xTicks = "auto", unitAxisTitle = false, referenceSolid = false, roleDescription, describedBy,
}: DurationCurveChartProps) {
  const { t } = useTranslation("dashboard");
  const { variant } = useOriderTheme();
  const seriesColor = resolveCssColor(color, variant);
  const referenceColor = resolveCssColor("var(--ink-2)", variant);
  const comparisonColor = resolveCssColor(comparison?.color ?? "var(--ink-3)", variant);
  const labelColor = resolveCssColor("var(--ink-1)", variant);
  const chartRef = useRef<ChartJS<"line"> | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const formatDuration = (sec: number): string => {
    if (sec < 60) return t("charts.powerCurve.unitSec", { n: sec });
    if (sec < 3600) return t("charts.powerCurve.unitMin", { n: Math.floor(sec / 60) });
    return t("charts.powerCurve.unitHour", { n: Math.floor(sec / 3600) });
  };

  const data = useMemo(() => ({
    labels: points.map((p) => formatDuration(p.durationSeconds)),
    datasets: [
      {
        label: datasetLabel,
        data: points.map((p) => p.value),
        borderColor: seriesColor,
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: seriesColor,
        fill: false,
        // 창 사이 값은 측정하지 않았다 — 곡선 보간은 없는 값을 그린다.
        tension: 0,
      },
      ...(comparison ? [{
        label: comparison.label,
        data: comparison.values,
        borderColor: comparisonColor,
        backgroundColor: comparisonColor,
        borderWidth: 1.5,
        borderDash: [5, 4],
        pointRadius: 2,
        pointBackgroundColor: comparisonColor,
        fill: false,
        tension: 0,
        spanGaps: true,
      }] : []),
      ...(reference ? [{
        label: reference.label,
        data: points.map(() => reference.value),
        borderColor: referenceColor,
        borderWidth: referenceSolid ? 1 : 1.5,
        borderDash: referenceSolid ? [] : [6, 3],
        pointRadius: 0,
        fill: false,
      }] : []),
    ],
    // formatDuration 은 t 에만 의존한다.
  }), [points, reference, comparison, seriesColor, referenceColor, comparisonColor, datasetLabel, referenceSolid, t]);

  // 선택적 직접 라벨 — 기록 갱신 같은 점 몇 개에만 붙인다. 플러그인 등록 없이 이 차트에만 건다.
  const annotationPlugin = useMemo<Plugin<"line">>(() => ({
    id: "durationCurveAnnotations",
    afterDatasetsDraw: (chart) => {
      if (!annotations?.length) return;
      const meta = chart.getDatasetMeta(0);
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = "600 11px " + (getComputedStyle(chart.canvas).fontFamily || "sans-serif");
      ctx.fillStyle = labelColor;
      // 비교 곡선이 위에 겹치므로 라벨은 점 아래에 둔다.
      ctx.textBaseline = "top";
      for (const { index, text } of annotations) {
        const point = meta.data[index];
        if (!point) continue;
        const width = ctx.measureText(text).width;
        const x = Math.min(Math.max(point.x, chart.chartArea.left + width / 2), chart.chartArea.right - width / 2);
        ctx.textAlign = "center";
        ctx.fillText(text, x, Math.min(point.y + 8, chart.chartArea.bottom - 14));
      }
      ctx.restore();
    },
  }), [annotations, labelColor]);

  // 키보드로도 툴팁을 읽는다 — 좌우 화살표가 창 길이를 옮긴다.
  const focusPoint = (index: number | null) => {
    const chart = chartRef.current;
    setActiveIndex(index);
    if (!chart) return;
    const active = index == null ? [] : chart.data.datasets
      .map((_, datasetIndex) => ({ datasetIndex, index }))
      .filter(({ datasetIndex }) => chart.data.datasets[datasetIndex]!.data[index] != null);
    chart.setActiveElements(active);
    const anchor = index == null ? null : chart.getDatasetMeta(0).data[index];
    chart.tooltip?.setActiveElements(active, anchor ? { x: anchor.x, y: anchor.y } : { x: 0, y: 0 });
    chart.update();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (points.length === 0) return;
    const last = points.length - 1;
    const next = event.key === "ArrowRight" ? Math.min(last, (activeIndex ?? -1) + 1)
      : event.key === "ArrowLeft" ? Math.max(0, (activeIndex ?? last + 1) - 1)
      : event.key === "Home" ? 0 : event.key === "End" ? last
      : event.key === "Escape" ? null : undefined;
    if (next === undefined) return;
    event.preventDefault();
    focusPoint(next);
  };

  const options: ChartOptions<"line"> = useMemo(() => {
    const textColor = resolveCssColor("var(--chart-grid-label)", variant);
    const gridColor = resolveCssColor("var(--grid-soft)", variant);

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: resolveCssColor("var(--bg-3)", variant),
          borderColor: resolveCssColor("var(--line)", variant),
          borderWidth: 1,
          titleColor: resolveCssColor("var(--ink-0)", variant),
          bodyColor: resolveCssColor("var(--ink-1)", variant),
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatNum(ctx.parsed.y, fractionDigits)}${unit}`,
            ...(tooltipFooter ? { footer: (items) => items.length ? tooltipFooter(items[0]!.dataIndex) : [] } : {}),
          },
          footerColor: resolveCssColor("var(--ink-1)", variant),
          footerFont: { weight: "normal" },
        },
      },
      scales: {
        x: {
          display: true,
          ticks: xTicks === "all" ? {
            color: textColor, font: { size: 12 }, autoSkip: false, maxRotation: 0,
            // 좁으면 짝수 번째 창과 마지막 창만 — 끝점(가장 긴 창)은 항상 읽혀야 한다.
            callback(this: { chart: { width: number }; getLabelForValue: (value: number) => string }, value: string | number, index: number, ticks: unknown[]) {
              const last = ticks.length - 1;
              // 끝점 바로 앞 짝수 지점은 끝 라벨과 겹치므로 비운다.
              const show = this.chart.width >= 480 || index === last || (index % 2 === 0 && index !== last - 1);
              return show ? this.getLabelForValue(Number(value)) : "";
            },
          } : { color: textColor, font: { size: 12 }, autoSkip: true, maxTicksLimit: 6 },
          grid: { color: gridColor },
        },
        y: {
          display: true,
          beginAtZero: true,
          title: unitAxisTitle ? { display: true, text: unit, color: textColor, font: { size: 12 } } : { display: false },
          ticks: { color: textColor, font: { size: 12 }, maxTicksLimit: 5, callback: (v) => unitAxisTitle ? `${v}` : `${v}${unit}` },
          grid: { color: gridColor },
        },
      },
    };
  }, [variant, unit, fractionDigits, tooltipFooter, xTicks, unitAxisTitle]);

  // 키보드로 옮긴 점을 보조기기에 읽어 준다 — 툴팁은 캔버스 그림이라 들리지 않는다.
  const liveText = activeIndex == null || !points[activeIndex] ? "" : [
    formatDuration(points[activeIndex]!.durationSeconds),
    `${datasetLabel} ${formatNum(points[activeIndex]!.value, fractionDigits)}${unit}`,
    ...(comparison && comparison.values[activeIndex] != null ? [`${comparison.label} ${formatNum(comparison.values[activeIndex]!, fractionDigits)}${unit}`] : []),
    ...(tooltipFooter ? tooltipFooter(activeIndex) : []),
  ].join(", ");

  if (points.length === 0) {
    return <ChartEmptyState title={emptyTitle} description={emptyDescription} minHeight={200} />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-3 text-[length:var(--fs-xs)] mb-2" style={{ color: "var(--ink-2)" }}>
        {showLegend && <ul className="mr-auto flex flex-wrap items-center gap-3">
          <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-4 border-t-2" style={{ borderColor: seriesColor }} />{datasetLabel}</li>
          {comparison && <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-4 border-t-2 border-dashed" style={{ borderColor: comparisonColor }} />{comparison.label}</li>}
          {reference && <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`w-4 ${referenceSolid ? "border-t" : "border-t-2 border-dashed"}`} style={{ borderColor: referenceColor }} />{reference.label}</li>}
        </ul>}
        {peakLabel && <span>{peakLabel}</span>}
        {reference && !showLegend && (
          <span className="inline-flex items-center gap-1.5" style={{ color: "var(--ink-2)" }}>
            <span aria-hidden="true" className="w-4 border-t-2 border-dashed" style={{ borderColor: "var(--ink-2)" }} />
            {reference.label}
          </span>
        )}
      </div>
      <div className={heightClassName}>
        <Line ref={chartRef} data={data} options={options} plugins={[annotationPlugin]}
          role="group" aria-roledescription={roleDescription} aria-describedby={describedBy}
          aria-label={ariaLabel ?? datasetLabel} tabIndex={0}
          onKeyDown={onKeyDown} onBlur={() => focusPoint(null)} className="rounded-[var(--r-sm)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" />
      </div>
      <div className="sr-only" aria-live="polite">{liveText}</div>
    </div>
  );
}
