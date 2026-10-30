import { planDayStartMs } from "@shared/training/planDate";
import { seoulWeekday } from "../../utils/seoulWeek";
import { Text } from "../../theme/components";
import { isSportUiEnabled } from "../../config/sportFeatures";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChartTooltip } from "../../theme/components/Chart";
import type { Activity } from "@shared/types";
import { resolveDuration } from "../../utils/activityTime";
import { getDiscipline } from "../../utils/disciplineFilter";

export function recentAthleteDays(activities: Activity[], now = new Date()) {
  const end = planDayStartMs(now.getTime());
  return Array.from({ length: 28 }, (_, index) => {
    const date = new Date(end - (27 - index) * 86400000);
    const next = new Date(date.getTime() + 86400000);
    const items = activities.filter(activity => activity.startTime >= date.getTime() && activity.startTime < next.getTime());
    return { date, items };
  });
}

export default function AthleteRecentSummary({ activities, loading, error }: { activities: Activity[]; loading: boolean; error: boolean }) {
  const { t, i18n } = useTranslation("athlete");
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const dayTooltipId = useId();
  const [activeWeek, setActiveWeek] = useState<number | null>(null);
  const tooltipId = useId();
  const days = useMemo(() => recentAthleteDays(activities), [activities]);
  const items = days.flatMap(day => day.items);
  const weeks = Array.from({ length: 4 }, (_, index) => days.slice(index * 7, index * 7 + 7).flatMap(day => day.items));
  const sports = ["bike", "run", "swim", "other"] as const;
  const totals = weeks.map(week => sports.map(sport => week.reduce((sum, activity) => {
    if ((getDiscipline(activity.type) ?? "other") !== sport) return sum;
    const duration = resolveDuration(activity.summary).displayMs;
    return sum + (Number.isFinite(duration) ? duration / 3600000 : 0);
  }, 0)));
  const max = Math.max(1, ...totals.map(week => week.reduce((sum, hours) => sum + hours, 0)));
  const prefix = seoulWeekday(days[0]!.date.getTime());
  return <section className="athlete-recent-summary" aria-label={t("profile.last28Days")}>
    <h2>{t("profile.last28Days")}</h2>
    <Text as="p" variant="caption">{t("profile.calendarBasis")}</Text>
    {loading || error ? <p role="status">{t(error ? "monthly.error" : "monthly.loading")}</p> : <>
      <p className="athlete-recent-summary-count"><strong>{items.length}</strong> {t("profile.activities")}</p>
      <div className="athlete-recent-visuals">
        <div className="athlete-calendar" style={{ position: "relative" }} aria-label={t("profile.activityCalendar")}>
          {Array.from({ length: 7 }, (_, index) => <span key={`label-${index}`} className="athlete-calendar-label">{new Intl.DateTimeFormat(i18n.language, { weekday: "narrow", timeZone: "Asia/Seoul" }).format(new Date(Date.UTC(2026, 9, 19 + index)))}</span>)}
          {Array.from({ length: prefix }, (_, index) => <span key={`blank-${index}`} />)}
          {days.map((day, index) => <button type="button" key={day.date.getTime()} className={`athlete-calendar-day${day.items.length ? " athlete-calendar-day--active" : ""}`}
            aria-label={`${day.date.toLocaleDateString(i18n.language, { timeZone: "Asia/Seoul" })} · ${t("stats.activitiesValue", { count: day.items.length })}`}
            aria-describedby={activeDay === index ? dayTooltipId : undefined}
            onMouseEnter={() => setActiveDay(index)} onMouseLeave={() => setActiveDay(null)}
            onFocus={() => setActiveDay(index)} onBlur={() => setActiveDay(null)}
            onClick={() => setActiveDay(index)} onKeyDown={event => { if (event.key === "Escape") setActiveDay(null); }} />)}
          {activeDay !== null && <ChartTooltip id={dayTooltipId} label={days[activeDay]!.date.toLocaleDateString(i18n.language, { timeZone: "Asia/Seoul" })} style={{ right: 0, bottom: "100%" }}>
            {t("stats.activitiesValue", { count: days[activeDay]!.items.length })}
          </ChartTooltip>}
        </div>
        <div className="athlete-week-bars" style={{ position: "relative" }} aria-label={t("profile.weeklyHours")}>
          {totals.map((week, index) => <div key={index} className="athlete-week-bar-column">
            <button type="button" className="athlete-week-bar" aria-label={`${days[index * 7]!.date.toLocaleDateString(i18n.language, { timeZone: "Asia/Seoul" })} · ${week.reduce((sum, hours) => sum + hours, 0).toFixed(1)} h`}
              aria-describedby={activeWeek === index ? tooltipId : undefined}
              onMouseEnter={() => setActiveWeek(index)} onMouseLeave={() => setActiveWeek(null)}
              onFocus={() => setActiveWeek(index)} onBlur={() => setActiveWeek(null)}
              onClick={() => setActiveWeek(index)} onKeyDown={event => { if (event.key === "Escape") setActiveWeek(null); }}>
              {week.map((hours, sport) => <span key={sport} className={`athlete-week-bar-segment athlete-week-bar-segment--${sports[sport]}`} style={{ height: `${hours / max * 100}%` }} />)}
            </button>
            <span>{days[index * 7]!.date.toLocaleDateString(i18n.language, { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" })}</span>
          </div>)}
          {activeWeek !== null && <ChartTooltip id={tooltipId} label={days[activeWeek * 7]!.date.toLocaleDateString(i18n.language, { timeZone: "Asia/Seoul" })} style={{ right: 0, bottom: "100%" }}>
            {totals[activeWeek]!.reduce((sum, hours) => sum + hours, 0).toFixed(1)} h
          </ChartTooltip>}
        </div>
      </div>
      <p className="athlete-week-legend">{sports.filter((sport, index) => isSportUiEnabled(sport) && totals.some(week => week[index]! > 0)).map(sport => <span key={sport} className={`athlete-week-legend--${sport}`}>{t(`profile.sports.${sport}`)}</span>)}<span>{t("profile.weeklyHours")}</span></p>
    </>}
  </section>;
}
