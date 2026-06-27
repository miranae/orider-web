import { useMemo, useState } from "react";
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
import { useTheme } from "../contexts/ThemeContext";
import { formatNum } from "../utils/units";

export interface WeeklyStat {
  week: string;
  distance: number;
  time: number;
  elevation: number;
  rides: number;
  tss: number;
}

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

type MetricKey = "distance" | "time" | "elevation";

interface WeeklyChartProps {
  data: WeeklyStat[];
  dataKey?: MetricKey;
  height?: number;
  /** 카드 + 종목 토글 + 모든 지표 툴팁의 풍부한 형태로 렌더링 */
  rich?: boolean;
}

const COLOR_MAP: Record<MetricKey, string> = {
  distance: "rgba(199, 247, 58, 0.85)", // lime
  time: "rgba(98, 200, 224, 0.85)",      // aqua
  elevation: "rgba(255, 168, 76, 0.85)", // amber
};

function formatPeriodLabel(week: string): string {
  // "2025.06" → "2025년 6월"
  const match = /^(\d{4})\.(\d{2})$/.exec(week);
  if (!match) return week;
  const year = match[1]!;
  const month = match[2]!;
  return `${year}년 ${parseInt(month, 10)}월`;
}

export default function WeeklyChart({
  data,
  dataKey = "distance",
  height = 150,
  rich = false,
}: WeeklyChartProps) {
  const { t } = useTranslation("dashboard");
  const { resolvedTheme } = useTheme();
  const [metric, setMetric] = useState<MetricKey>(dataKey);
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
  const ridesLabel = "활동";
  const ridesUnit = "회";
  const active = METRIC_META[activeKey];

  // Chart.js는 CSS 변수를 해석 못해서 테마별 실제 색상값을 직접 지정.
  const isDark = resolvedTheme === "dark";
  const tickColor = isDark ? "rgba(235,236,238,0.72)" : "rgba(20,22,26,0.72)";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const tooltipBg = isDark ? "rgba(20,22,26,0.96)" : "rgba(255,255,255,0.98)";
  const tooltipBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const tooltipTitle = isDark ? "rgba(245,246,248,1)" : "rgba(18,20,24,1)";
  const tooltipBody = isDark ? "rgba(220,222,226,1)" : "rgba(36,40,46,1)";

  const labels = useMemo(
    () =>
      data.map((d) => {
        // x축은 짧게: "6월" 형식
        const m = /^\d{4}\.(\d{2})$/.exec(d.week);
        return m ? `${parseInt(m[1]!, 10)}월` : d.week;
      }),
    [data],
  );

  const totalActive = useMemo(
    () => data.reduce((acc, d) => acc + d[activeKey], 0),
    [data, activeKey],
  );

  const chartData = {
    labels,
    datasets: [
      {
        data: data.map((d) => d[activeKey]),
        backgroundColor: COLOR_MAP[activeKey],
        borderRadius: 4,
        barPercentage: 0.75,
      },
    ],
  };

  const chartElement = (
    <div style={{ height }}>
      <Bar
        data={chartData}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          // 모바일 탭 시 tooltip 발화 + 가장 가까운 막대로 활성. 'nearest' + axis 'x'
          // 로 손가락이 막대 정확히 위 아닐 때도 같은 열의 막대가 active.
          // events 는 chart.js v4 기본값과 동일 — 향후 default 변경 대비 명시.
          interaction: { mode: "nearest" as const, axis: "x" as const, intersect: false },
          events: ["mousemove", "mouseout", "click", "touchstart", "touchmove"] as const,
          plugins: {
            tooltip: {
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
                  return formatPeriodLabel(data[i]?.week ?? "");
                },
                label: (ctx: TooltipItem<"bar">) => {
                  if (rich) {
                    const row = data[ctx.dataIndex];
                    if (!row) return "";
                    return [
                      `${METRIC_META.distance.label}  ${formatNum(row.distance, METRIC_META.distance.digits)} ${METRIC_META.distance.unit}`,
                      `${METRIC_META.time.label}  ${formatNum(row.time, METRIC_META.time.digits)} ${METRIC_META.time.unit}`,
                      `${METRIC_META.elevation.label}  ${formatNum(row.elevation, METRIC_META.elevation.digits)} ${METRIC_META.elevation.unit}`,
                      `${ridesLabel}  ${row.rides}${ridesUnit}`,
                    ];
                  }
                  return `${active.label}  ${formatNum(ctx.parsed.y, active.digits)} ${active.unit}`.trim();
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 10 }, color: tickColor },
            },
            y: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: { font: { size: 10 }, color: tickColor },
            },
          },
        }}
      />
    </div>
  );

  if (!rich) return chartElement;

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--line-soft)] bg-[var(--bg-1)] p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-[length:var(--fs-sm)] font-semibold text-[var(--ink-0)]">
            월간 누적
          </h3>
          <p className="text-[length:var(--fs-xs)] text-[var(--ink-3)] mt-0.5">
            {active.label} {formatNum(totalActive, active.digits)} {active.unit}
          </p>
        </div>
        <div className="flex bg-[var(--bg-2)] rounded-[var(--r-lg)] p-1">
          {(Object.keys(METRIC_META) as MetricKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setMetric(k)}
              className={`px-2.5 py-1 text-[length:var(--fs-xs)] font-medium rounded-[var(--r-md)] transition-colors ${
                metric === k
                  ? "bg-[var(--bg-3)] text-[var(--ink-0)]"
                  : "text-[var(--ink-3)] hover:text-[var(--ink-1)]"
              }`}
            >
              {METRIC_META[k].label}
            </button>
          ))}
        </div>
      </div>
      {chartElement}
    </div>
  );
}
