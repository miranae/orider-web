import { useTranslation } from "react-i18next";
import type { DailyLoad } from "../utils/fitnessMetrics";
import { toLocalDate } from "../utils/dateUtils";

interface WeeklySummaryProps {
  dailyData: DailyLoad[];
  activities: { startTime: number; summary: { ridingTimeMillis: number; distance: number } }[];
}

function getWeekRange(weeksAgo: number): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - mondayOffset - weeksAgo * 7);
  const thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisMonday.getDate() + 6);
  return { start: toLocalDate(thisMonday.getTime()), end: toLocalDate(thisSunday.getTime()) };
}


function formatDelta(current: number, previous: number, newLabel: string): { text: string; color: string } {
  if (previous === 0) return current > 0 ? { text: newLabel, color: "text-green-500" } : { text: "", color: "" };
  const pct = ((current - previous) / previous) * 100;
  const sign = pct > 0 ? "+" : "";
  return {
    text: `${sign}${Math.round(pct)}%`,
    color: pct > 0 ? "text-green-500" : pct < 0 ? "text-red-500" : "text-[var(--ink-3)]",
  };
}

export default function WeeklySummary({ dailyData, activities }: WeeklySummaryProps) {
  const { t } = useTranslation("dashboard");

  function formatDuration(ms: number): string {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return t("weeklySummary.durationHourMin", { h, m });
    return t("weeklySummary.durationMin", { m });
  }

  const thisWeek = getWeekRange(0);
  const lastWeek = getWeekRange(1);

  const thisWeekLoad = dailyData
    .filter((d) => d.date >= thisWeek.start && d.date <= thisWeek.end)
    .reduce((sum, d) => sum + d.totalLoad, 0);
  const lastWeekLoad = dailyData
    .filter((d) => d.date >= lastWeek.start && d.date <= lastWeek.end)
    .reduce((sum, d) => sum + d.totalLoad, 0);

  const thisWeekActs = activities.filter((a) => {
    const d = toLocalDate(a.startTime);
    return d >= thisWeek.start && d <= thisWeek.end;
  });
  const lastWeekActs = activities.filter((a) => {
    const d = toLocalDate(a.startTime);
    return d >= lastWeek.start && d <= lastWeek.end;
  });

  const thisWeekTime = thisWeekActs.reduce((s, a) => s + a.summary.ridingTimeMillis, 0);
  const lastWeekTime = lastWeekActs.reduce((s, a) => s + a.summary.ridingTimeMillis, 0);
  const thisWeekDist = thisWeekActs.reduce((s, a) => s + a.summary.distance, 0) / 1000;
  const lastWeekDist = lastWeekActs.reduce((s, a) => s + a.summary.distance, 0) / 1000;

  const newLabel = t("weeklySummary.newThisWeek");
  const loadDelta = formatDelta(thisWeekLoad, lastWeekLoad, newLabel);
  const timeDelta = formatDelta(thisWeekTime, lastWeekTime, newLabel);
  const distDelta = formatDelta(thisWeekDist, lastWeekDist, newLabel);

  return (
    <div className="rounded-[var(--r-lg)] shadow-sm p-5 border" style={{ background: "var(--bg-0)", borderColor: "var(--line-soft)" }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("weeklySummary.title")}</h3>
        <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>
          {thisWeek.start.slice(5)} ~ {thisWeek.end.slice(5)}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-2)" }}>{t("weeklySummary.load")}</div>
          <div className="text-[length:var(--fs-xl)] font-bold tabular-nums">{thisWeekLoad}</div>
          {loadDelta.text && <div className={`text-[length:var(--fs-xs)] ${loadDelta.color}`}>{t("weeklySummary.vsLastWeek", { delta: loadDelta.text })}</div>}
        </div>
        <div>
          <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-2)" }}>{t("weeklySummary.activities")}</div>
          <div className="text-[length:var(--fs-xl)] font-bold tabular-nums">{t("weeklySummary.activitiesCount", { count: thisWeekActs.length })}</div>
          <div className="text-[length:var(--fs-xs)] text-[var(--ink-3)]">{t("weeklySummary.activitiesPrev", { count: lastWeekActs.length })}</div>
        </div>
        <div>
          <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-2)" }}>{t("weeklySummary.time")}</div>
          <div className="text-[length:var(--fs-xl)] font-bold tabular-nums">{formatDuration(thisWeekTime)}</div>
          {timeDelta.text && <div className={`text-[length:var(--fs-xs)] ${timeDelta.color}`}>{t("weeklySummary.vsLastWeek", { delta: timeDelta.text })}</div>}
        </div>
        <div>
          <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-2)" }}>{t("weeklySummary.distance")}</div>
          <div className="text-[length:var(--fs-xl)] font-bold tabular-nums">{thisWeekDist.toFixed(1)} km</div>
          {distDelta.text && <div className={`text-[length:var(--fs-xs)] ${distDelta.color}`}>{t("weeklySummary.vsLastWeek", { delta: distDelta.text })}</div>}
        </div>
      </div>
    </div>
  );
}
