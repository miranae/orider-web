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
  /**
   * `log` 는 x 를 실제 창 길이(초)의 로그 축으로 놓는다 — 측정한 창 사이 간격이 시간 비율대로 보인다.
   * 눈금선은 측정 지점마다 긋고, 라벨은 겹치지 않는 것만 단다.
   */
  xScale?: "category" | "log";
  /** 캔버스 그룹의 역할 설명(예: "차트")과 보조 설명 요소 id. */
  roleDescription?: string;
  describedBy?: string;
}

/** 사람이 읽기 좋은 눈금 간격(1·2·2.5·5 × 10ⁿ). y 눈금이 실제로 4~5개 나오게 한다. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * power;
}

/**
 * 로그 시간축에서 라벨을 달 측정 지점. 끝점(가장 긴 창)은 항상, 나머지는 왼쪽부터
 * 앞 라벨·끝 라벨과 `minPx` 이상 떨어질 때만 단다 — 눈금선은 모든 지점에 남는다.
 */
export function visibleLogLabels(durations: number[], widthPx: number, minPx = 36): Set<number> {
  const shown = new Set<number>();
  if (!durations.length) return shown;
  const lo = Math.log(durations[0]!), hi = Math.log(durations[durations.length - 1]!);
  const at = (value: number) => hi === lo ? 0 : (Math.log(value) - lo) / (hi - lo) * widthPx;
  const last = durations.length - 1;
  let previous = -Infinity;
  durations.forEach((value, index) => {
    if (index === last) return;
    if (at(value) - previous >= minPx && at(durations[last]!) - at(value) >= minPx) { shown.add(index); previous = at(value); }
  });
  shown.add(last);
  return shown;
}

export default function DurationCurveChart({
  points, unit, fractionDigits = 0, color, datasetLabel,
  reference = null, peakLabel, emptyTitle, emptyDescription,
  comparison = null, tooltipFooter, annotations, ariaLabel, heightClassName = "h-[200px]", showLegend = false,
  xTicks = "auto", xScale = "category", unitAxisTitle = false, referenceSolid = false, roleDescription, describedBy,
}: DurationCurveChartProps) {
  const { t } = useTranslation("dashboard");
  const { variant } = useOriderTheme();
  const seriesColor = resolveCssColor(color, variant);
  const referenceColor = resolveCssColor("var(--ink-2)", variant);
  const comparisonColor = resolveCssColor(comparison?.color ?? "var(--ink-3)", variant);
  const labelColor = resolveCssColor("var(--ink-0)", variant);
  const labelBackground = resolveCssColor("var(--bg-1)", variant);
  const labelBorder = resolveCssColor("var(--line)", variant);
  const log = xScale === "log";
  // log 축이면 각 점이 (창 길이, 값) 좌표를 갖는다. 비교·기준선도 같은 x 를 쓴다.
  const xy = (values: Array<number | null>) => log ? values.map((y, index) => ({ x: points[index]!.durationSeconds, y })) : values;
  const chartRef = useRef<ChartJS<"line"> | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const formatDuration = (sec: number): string => {
    if (sec < 60) return t("charts.powerCurve.unitSec", { n: sec });
    if (sec < 3600) return t("charts.powerCurve.unitMin", { n: Math.floor(sec / 60) });
    return t("charts.powerCurve.unitHour", { n: Math.floor(sec / 3600) });
  };

  const data = useMemo(() => ({
    labels: log ? undefined : points.map((p) => formatDuration(p.durationSeconds)),
    datasets: [
      {
        label: datasetLabel,
        data: xy(points.map((p) => p.value)),
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
        data: xy(comparison.values),
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
        data: xy(points.map(() => reference.value)),
        borderColor: referenceColor,
        borderWidth: referenceSolid ? 1 : 1.5,
        borderDash: referenceSolid ? [] : [6, 3],
        pointRadius: 0,
        fill: false,
      }] : []),
    ],
    // formatDuration 은 t 에만 의존한다.
    // xy 는 points·log 에만 의존한다.
  }), [points, reference, comparison, seriesColor, referenceColor, comparisonColor, datasetLabel, referenceSolid, log, t]);

  // 선택적 직접 라벨 — 기록 갱신 같은 점 몇 개에만 붙인다. 플러그인 등록 없이 이 차트에만 건다.
  const annotationPlugin = useMemo<Plugin<"line">>(() => ({
    id: "durationCurveAnnotations",
    afterDatasetsDraw: (chart) => {
      if (!annotations?.length) return;
      const meta = chart.getDatasetMeta(0);
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = "600 11px " + (getComputedStyle(chart.canvas).fontFamily || "sans-serif");
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      // 점 오른쪽 위 바탕 상자 안에 쓴다 — 선과 겹쳐도 읽힌다. 차트 밖으로 나가면 왼쪽·아래로 접는다.
      for (const { index, text } of annotations) {
        const point = meta.data[index];
        if (!point) continue;
        const padX = 5, height = 18, width = ctx.measureText(text).width + padX * 2;
        // 곡선은 오른쪽으로 내려가므로 상자를 점보다 한 칸 더 위에 띄우고 지시선으로 잇는다.
        let x = point.x + 6, y = point.y - 20 - height;
        if (x + width > chart.chartArea.right) x = point.x - 6 - width;
        if (y < chart.chartArea.top) y = point.y + 14;
        ctx.strokeStyle = labelBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(x < point.x ? x + width : x, y < point.y ? y + height : y);
        ctx.stroke();
        ctx.fillStyle = labelBackground;
        ctx.strokeStyle = labelBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = labelColor;
        ctx.fillText(text, x + padX, y + height / 2);
      }
      ctx.restore();
    },
  }), [annotations, labelColor, labelBackground, labelBorder]);

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

  // 요약 곡선(log 축)은 y 눈금을 4~5개로 맞춘다 — 최대값을 4로 나눈 값을 사람이 읽는 간격으로 올림.
  const yMax = Math.max(0, ...points.map((p) => p.value), ...(comparison?.values ?? []).map((v) => v ?? 0), reference?.value ?? 0);
  const yStep = log && yMax > 0 ? niceStep(yMax / 4) : null;
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
            title: (items) => items.length && points[items[0]!.dataIndex] ? formatDuration(points[items[0]!.dataIndex]!.durationSeconds) : "",
            label: (ctx) => `${ctx.dataset.label}: ${formatNum(ctx.parsed.y, fractionDigits)}${unit}`,
            ...(tooltipFooter ? { footer: (items) => items.length ? tooltipFooter(items[0]!.dataIndex) : [] } : {}),
          },
          footerColor: resolveCssColor("var(--ink-1)", variant),
          footerFont: { weight: "normal" },
        },
      },
      scales: {
        x: log ? {
          type: "logarithmic",
          display: true,
          min: points[0]?.durationSeconds,
          max: points[points.length - 1]?.durationSeconds,
          // 눈금은 측정한 창마다 — 로그 축 기본 눈금(1·10·100…)은 측정하지 않은 길이다.
          afterBuildTicks: (scale) => { scale.ticks = points.map((p) => ({ value: p.durationSeconds })); },
          ticks: {
            color: textColor, font: { size: 12 }, autoSkip: false, maxRotation: 0,
            callback(this: { chart: { chartArea?: { width: number }; width: number } }, _value: string | number, index: number) {
              const width = this.chart.chartArea?.width ?? this.chart.width;
              const shown = visibleLogLabels(points.map((p) => p.durationSeconds), width);
              return shown.has(index) && points[index] ? formatDuration(points[index]!.durationSeconds) : "";
            },
          },
          grid: { color: gridColor },
        } : {
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
          ...(yStep ? { max: yStep * Math.ceil(yMax / yStep) } : {}),
          ticks: { color: textColor, font: { size: 12 }, maxTicksLimit: 6, ...(yStep ? { stepSize: yStep } : {}), callback: (v) => unitAxisTitle ? `${v}` : `${v}${unit}` },
          grid: { color: gridColor },
        },
      },
    };
    // formatDuration 은 t 에만 의존한다.
  }, [variant, unit, fractionDigits, tooltipFooter, xTicks, unitAxisTitle, log, points, yStep, yMax, t]);

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
