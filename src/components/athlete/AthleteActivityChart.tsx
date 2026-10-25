import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import WeeklyChart from "../WeeklyChart";
import { Button, Select } from "../../theme/components";
import { athleteProfilePeriods, type AthletePeriod } from "./athleteProfilePeriods";

export default function AthleteActivityChart({ activities, loadActivities = activities, selected, onSelect }: { activities: Activity[]; loadActivities?: Activity[]; selected: AthletePeriod | null; onSelect: (period: AthletePeriod | null) => void }) {
  const { t, i18n } = useTranslation("athlete");
  const years = useMemo(() => [...new Set([new Date().getFullYear(), ...activities.filter(item => Number.isFinite(item.startTime) && item.startTime > 0).map(item => new Date(item.startTime).getFullYear())])].sort((a, b) => b - a), [activities]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [mode, setMode] = useState<"week" | "month">("month");
  const [attempt, setAttempt] = useState(0);
  const periods = useMemo(() => athleteProfilePeriods(activities, year, mode, loadActivities).filter(period => period.range.start <= Date.now()), [activities, loadActivities, year, mode]);
  const reset = () => { onSelect(null); setAttempt(value => value + 1); };
  return <section className="athlete-history-chart" aria-label={t("profile.history")}>
    <div className="athlete-section-heading"><h2>{t("profile.history")}</h2>
      <Select aria-label={t("profile.year")} value={year} onChange={event => { setYear(Number(event.target.value)); reset(); }}>{years.map(value => <option key={value} value={value}>{value}</option>)}</Select>
      <Button size="sm" variant={mode === "week" ? "secondary" : "ghost"} aria-pressed={mode === "week"} onClick={() => { setMode("week"); reset(); }}>{t("profile.week")}</Button>
      <Button size="sm" variant={mode === "month" ? "secondary" : "ghost"} aria-pressed={mode === "month"} onClick={() => { setMode("month"); reset(); }}>{t("profile.month")}</Button>
    </div>
    {periods.length ? <WeeklyChart key={`${year}-${mode}-${attempt}`} data={periods.map(period => period.stat)} rich showAllPeriods periodUnit={mode} height={180} onPeriodSelect={key => onSelect(periods.find(period => period.stat.week === key)?.range ?? null)} /> : <p>{t("profile.noPeriodActivities")}</p>}
    {selected && <div className="athlete-period-selection" role="status"><span>{new Date(selected.start).toLocaleDateString(i18n.language)} – {new Date(selected.end - 1).toLocaleDateString(i18n.language)}</span><Button size="sm" variant="ghost" onClick={reset}>{t("profile.allRecent")}</Button></div>}
  </section>;
}
