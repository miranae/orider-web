import "./WeeklyChart.css";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, IconButton, Text } from "../theme/components";
import type { WeeklyLoadEvidence } from "../utils/weeklyLoadEvidence";
export type { WeeklyLoadEvidence } from "../utils/weeklyLoadEvidence";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  type TooltipItem,
} from "chart.js";
import { useOriderTheme } from "../theme";
import { resolveCssColor } from "../utils/cssColor";
import { formatTrainingLoad } from "../utils/trainingLoadDisplay";
import { formatNum } from "../utils/units";

export interface WeeklyStat {
  week: string;
  distance: number;
  time: number;
  elevation: number;
  rides: number;
  /** 주간 TSS 합계. 아는 값이 하나도 없으면 null — 0 을 확정값처럼 그리지 않는다 (#2237). */
  tss: number | null;
  /** 합계에 클라 추정치가 섞였는가. 화면에 쓰면 "추정 포함" 으로 밝혀야 한다. */
  tssEstimated: boolean;
  /** 산출되지 않은 지원 활동 수. 누락은 레거시 전송 형식; 현재 producer는 항상 채운다. */
  tssUnknownCount?: number;
  /** 홈 주간 부하와 같은 산입 경로에서 만든 근거. 이전 소비자와 호환된다. */
  loadEvidence?: WeeklyLoadEvidence;
}

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

type MetricKey = "distance" | "time" | "elevation";

interface WeeklyChartProps {
  data: WeeklyStat[];
  dataKey?: MetricKey;
  height?: number;
  /** 카드 + 종목 토글 + 모든 지표 툴팁의 풍부한 형태로 렌더링 */
  rich?: boolean;
  showAllPeriods?: boolean;
  onPeriodSelect?: (period: string) => void;
  periodUnit?: "week" | "month";
}

const COLOR_MAP: Record<MetricKey, string> = {
  distance: "var(--accent)",
  time: "var(--color-info)",
  elevation: "var(--chart-altitude)",
};

function formatPeriodLabel(week: string, language: string): string {
  // "2025.06" → "2025년 6월"
  const match = /^(\d{4})\.(\d{2})$/.exec(week);
  if (!match) return week;
  const year = match[1]!;
  const month = match[2]!;
  return new Intl.DateTimeFormat(language, { year: "numeric", month: "long" }).format(new Date(Number(year), Number(month) - 1, 1));
}

export default function WeeklyChart({
  data,
  dataKey = "distance",
  height = 150,
  rich = false,
  showAllPeriods = false,
  onPeriodSelect,
  periodUnit = "month",
}: WeeklyChartProps) {
  const { t, i18n } = useTranslation("dashboard");
  const { variant } = useOriderTheme();
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>(dataKey);
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestPeriod = data[data.length - 1]?.week;
  useEffect(() => {
    if (showAllPeriods && scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [showAllPeriods, latestPeriod, data.length]);
  const activeKey: MetricKey = rich ? metric : dataKey;

  // 기존 i18n 라벨 "거리 (km)" 형태에서 라벨/단위를 분리.
  const splitLabel = (raw: string): { label: string; unit: string } => {
    const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(raw);
    return m ? { label: m[1]!.trim(), unit: m[2]!.trim() } : { label: raw, unit: "" };
  };
  const METRIC_META: Record<MetricKey, { label: string; unit: string; digits: number }> = {
    distance: { ...splitLabel(t("charts.weeklyChart.distance")), digits: 1 },
    time: { ...splitLabel(t("charts.weeklyChart.time")), digits: 1 },
    elevation: { ...splitLabel(t("charts.weeklyChart.elevation")), digits: 0 },
  };
  const active = METRIC_META[activeKey];

  // Chart.js 캔버스는 CSS 변수를 해석하지 못하므로 테마 색상을 확정해 전달한다.
  const tickColor = resolveCssColor("var(--chart-grid-label)", variant);
  const gridColor = resolveCssColor("var(--grid-soft)", variant);
  const tooltipBg = resolveCssColor("var(--bg-3)", variant);
  const tooltipBorder = resolveCssColor("var(--line)", variant);
  const tooltipTitle = resolveCssColor("var(--ink-0)", variant);
  const tooltipBody = resolveCssColor("var(--ink-1)", variant);

  const labels = useMemo(
    () =>
      data.map((d) => {
        if (showAllPeriods) return d.week;
        // x축은 짧게: "6월" 형식
        const m = /^\d{4}\.(\d{2})$/.exec(d.week);
        return m ? new Intl.DateTimeFormat(i18n.language, {month: "short"}).format(new Date(2000, Number(m[1]) - 1, 1)) : d.week;
      }),
    [data, showAllPeriods, i18n.language],
  );

  const totalActive = useMemo(
    () => data.reduce((acc, d) => {
      const value = d[activeKey];
      return acc + (Number.isFinite(value) ? value : 0);
    }, 0),
    [data, activeKey],
  );

  const chartData = {
    labels,
    datasets: [
      {
        data: data.map((d) => Number.isFinite(d[activeKey]) ? d[activeKey] : 0),
        backgroundColor: resolveCssColor(COLOR_MAP[activeKey], variant),
        borderRadius: 4,
        barPercentage: 0.75,
      },
    ],
  };

  const selectedRow = selectedWeek ? data.find(row => row.week === selectedWeek) ?? data[data.length - 1] : data[data.length - 1];
  const inspectedIndex = selectedRow ? data.indexOf(selectedRow) : 0;
  const inspect = (index: number) => {
    const row = data[Math.max(0, Math.min(data.length - 1, index))];
    if (row) { setSelectedWeek(row.week); onPeriodSelect?.(row.week); }
  };

  const chartElement = (
    <div ref={scrollRef} style={{ overflowX: showAllPeriods ? "auto" : undefined }} tabIndex={rich || showAllPeriods ? 0 : undefined}
      aria-label={rich ? t(periodUnit === "week" ? "charts.weeklyChart.weekTitle" : "charts.weeklyChart.title") : undefined}
      onKeyDown={event => {
        if (!rich || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        inspect(event.key === "Home" ? 0 : event.key === "End" ? data.length - 1 : inspectedIndex + (event.key === "ArrowLeft" ? -1 : 1));
      }}>
    <div style={{ height, minWidth: showAllPeriods ? `${data.length * 4.5}rem` : undefined }}>
      <Bar
        data={chartData}
        options={{
          responsive: true,
          // 긴 월간 이력이 모바일 고해상도 캔버스 크기 한도를 넘지 않도록 제한.
          devicePixelRatio: showAllPeriods ? 1 : undefined,
          maintainAspectRatio: false,
          animation: rich ? false : undefined,
          onClick: rich ? (_event, elements) => { if (elements[0]) inspect(elements[0].index); } : undefined,
          // Rich history uses pinned details: swipes scroll without hover popups or redraw animation.
          interaction: { mode: "nearest" as const, axis: "x" as const, intersect: false },
          events: rich ? ["click"] : ["mousemove", "mouseout", "click", "touchstart", "touchmove"],
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: !rich,
              backgroundColor: tooltipBg,
              borderColor: tooltipBorder,
              borderWidth: 1,
              titleColor: tooltipTitle,
              bodyColor: tooltipBody,
              padding: 10,
              displayColors: false,
              callbacks: {
                title: (items: TooltipItem<"bar">[]) => {
                  const i = items[0]?.dataIndex ?? 0;
                  return formatPeriodLabel(data[i]?.week ?? "", i18n.language);
                },
                label: (ctx: TooltipItem<"bar">) => {
                  return `${active.label}  ${formatNum(ctx.parsed.y, active.digits)} ${active.unit}`.trim();
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 12 }, color: tickColor, autoSkip: !showAllPeriods, maxTicksLimit: showAllPeriods ? undefined : 6, maxRotation: 0 },
            },
            y: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: { font: { size: 12 }, color: tickColor },
            },
          },
        }}
      />
    </div>
    </div>
  );

  if (!rich) return chartElement;

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--line-soft)] bg-[var(--bg-1)] p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-[length:var(--fs-sm)] font-semibold text-[var(--ink-0)]">
            {t(periodUnit === "week" ? "charts.weeklyChart.weekTitle" : "charts.weeklyChart.title")}
          </h3>
          <p className="text-[length:var(--fs-xs)] text-[var(--ink-3)] mt-0.5">
            {active.label} {formatNum(totalActive, active.digits)} {active.unit}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-1 w-full">
          {(Object.keys(METRIC_META) as MetricKey[]).map((k) => (
            <Button key={k} variant={metric === k ? "secondary" : "ghost"} aria-pressed={metric === k} className="min-w-0 px-2!" onClick={() => setMetric(k)}>{METRIC_META[k].label}</Button>
          ))}
        </div>
      </div>
      {showAllPeriods && data.length > 0 && <p className="text-[length:var(--fs-xs)] text-[var(--ink-3)] mb-2">{data[0]?.week} – {latestPeriod}</p>}
      {chartElement}
      {selectedRow && <section className="weekly-chart-inspection" aria-label={t(periodUnit === "week" ? "charts.weeklyChart.weekTitle" : "charts.weeklyChart.title")}>
        <div className="weekly-chart-inspection__header">
          <Text as="h4" variant="bodyMedium" weight={600}>{formatPeriodLabel(selectedRow.week, i18n.language)}</Text>
          <div className="weekly-chart-inspection__navigation">
            <IconButton aria-label={t(periodUnit === "week" ? "charts.weeklyChart.previousWeek" : "common:field.prevMonth")} disabled={inspectedIndex <= 0} onClick={() => inspect(inspectedIndex - 1)} icon={<ChevronLeft size={18} />} />
            <IconButton aria-label={t(periodUnit === "week" ? "charts.weeklyChart.nextWeek" : "common:field.nextMonth")} disabled={inspectedIndex >= data.length - 1} onClick={() => inspect(inspectedIndex + 1)} icon={<ChevronRight size={18} />} />
          </div>
        </div>
        <div aria-live="polite" aria-atomic="true">
          <span className="sr-only">{formatPeriodLabel(selectedRow.week, i18n.language)}</span>
          <dl className="weekly-chart-inspection__values">{(Object.keys(METRIC_META) as MetricKey[]).map(key => <div key={key}>
            <dt>{METRIC_META[key].label}</dt>
            <dd>{formatNum(selectedRow[key], METRIC_META[key].digits)} <span>{METRIC_META[key].unit}</span></dd>
          </div>)}</dl>
          <Text as="p" variant="caption" tone="tertiary">{t("charts.weeklyChart.recordsCount", { count: selectedRow.rides })} · {formatTrainingLoad({ ...selectedRow, tssUnknownCount: selectedRow.tssUnknownCount ?? 0 }, t)}</Text>
        </div>
      </section>}
    </div>
  );
}
