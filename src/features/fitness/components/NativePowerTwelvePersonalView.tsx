import "./fitness-analysis-controls.css";
import { CalendarDays } from "lucide-react";
import DateField from "../../../components/redesign/DateField";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NativePowerTwelveResponse, NativePowerTwelvePeriod, NativePowerTwelveWinner } from "@shared/types/stage-native-power-v2-twelve";
import { NATIVE_POWER_V2_TWELVE_SECONDS } from "@shared/types/stage-native-power-v2-twelve";
import { Button, DropdownSelect, Text } from "../../../theme";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { makeDurationLabel } from "../fitnessPageUtils";
import { nativeTwelveDisplayValue } from "../models/nativePowerTwelve";
import "./native-power-twelve.css";
export interface NativePowerLoadedActivity { activityId: string; title: string; headBinding: string }
export interface NativePowerTwelveViewProps {
  activities: readonly NativePowerLoadedActivity[]; selectedIds: readonly string[]; inspectedIds: readonly string[];
  periods: readonly NativePowerTwelvePeriod[]; response: NativePowerTwelveResponse|null;
  busy: boolean; failure: boolean; enabled: boolean;
  onSelect: (ids: string[]) => void; onInspect: (id: string) => void; onLoad: () => void;
  onPeriods: (periods: NativePowerTwelvePeriod[]) => void;
}
export function NativePowerTwelvePersonalView(props: NativePowerTwelveViewProps) {
  const { t } = useTranslation("fitness");
  const id = useId(), label = makeDurationLabel(t);
  const [unit, setUnit] = useState<"W"|"W/kg">("W"), [duration, setDuration] = useState(300), [tableOrigin, setTableOrigin] = useState<"measured"|"storedNativeUnverified">("measured");
  const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const display = (winner: NativePowerTwelveWinner|null) => {
    const value = unit === "W" ? winner?.slot.witness?.maxAveragePowerW : winner?.slot.wattsPerKg;
    return nativeTwelveDisplayValue(value,unit);
  };
  const winner = (periodIndex: number, seconds: number, origin: "measured"|"storedNativeUnverified") => {
    const row = props.response?.periods[periodIndex]?.rows.find(value => value.durationSeconds === seconds);
    return (unit === "W" ? row?.[origin].watts : row?.[origin].wattsPerKg) ?? null;
  };
  return <section className="fitness-analysis-controls native-twelve" aria-label={t("powerSkills.native.title")}>
    <div className="space-y-2"><Text as="h3" variant="bodyLarge" weight={600}>{t("powerSkills.native.title")}</Text>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("powerSkills.native.scope")}</Text></div>
    <details className="native-twelve-details" open={!props.response}><summary>{t("powerSkills.native.selectActivities", { count: props.selectedIds.length })}</summary>
      <div className="native-twelve-candidates">{props.activities.map(activity => <div key={activity.activityId} className="native-twelve-candidate">
        <label><input type="checkbox" checked={props.selectedIds.includes(activity.activityId)} disabled={props.busy || !props.selectedIds.includes(activity.activityId) && props.selectedIds.length >= 2} onChange={event => props.onSelect(event.target.checked ? [...props.selectedIds, activity.activityId] : props.selectedIds.filter(value => value !== activity.activityId))} /><Text variant="bodyMedium">{activity.title}</Text></label>
        <Button variant="secondary" size="lg" disabled={props.busy || !props.enabled || !props.selectedIds.includes(activity.activityId)} onClick={() => props.onInspect(activity.activityId)}>{t(props.inspectedIds.includes(activity.activityId) ? "powerSkills.native.reinspect" : "powerSkills.native.inspect")}</Button>
      </div>)}{props.activities.length === 0 && <Text as="p" variant="bodyMedium" tone="secondary">{t("powerSkills.native.noActivities")}</Text>}</div>
    </details>
    <div className="native-twelve-controls"><Button variant="secondary" size="lg" disabled={props.busy} onClick={() => { const now = Date.now(); props.onPeriods([{ id: "recent", fromInclusiveMs: now - 56 * 86400000, toExclusiveMs: now }, { id: "all", fromInclusiveMs: 0, toExclusiveMs: now }]); }}>{t("powerSkills.native.presets")}</Button>
      <Button variant="primary" size="lg" disabled={!props.enabled || props.busy || props.selectedIds.length === 0 || props.selectedIds.some(value => !props.inspectedIds.includes(value)) || props.periods.some(period => period.fromInclusiveMs >= period.toExclusiveMs || period.toExclusiveMs > Date.now())} onClick={props.onLoad}>{t(props.busy ? "powerSkills.native.loading" : "powerSkills.native.load")}</Button></div>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("powerSkills.native.calendarBasis")}</Text>
    <details className="native-twelve-details"><summary>{t("periodCurve.custom")}</summary><div className="native-twelve-values">{props.periods.map((period,index)=><div key={period.id} className="space-y-3"><Text as="h4" variant="bodyMedium" weight={600}>{t("periodCurve.period",{n:index+1})}</Text>{(["fromInclusiveMs","toExclusiveMs"] as const).map(field=><div key={field} className="fitness-date-control"><label htmlFor={`${id}-${index}-${field}`}><Text variant="bodyMedium">{t(field==="fromInclusiveMs"?"periodCurve.from":"periodCurve.through")}</Text></label><DateField id={`${id}-${index}-${field}`} portal icon={<CalendarDays size={16} aria-hidden="true" />} max={date(Date.now())} value={date(field==="toExclusiveMs"?period[field]-1:period[field])} onChange={next => {const parsed=Date.parse(`${next}T00:00:00Z`);if(!Number.isFinite(parsed))return;const value=field==="toExclusiveMs"?Math.min(Date.now(),parsed+86400000):parsed;props.onPeriods(props.periods.map((p,i)=>i===index?{...p,[field]:value}:p));}} /></div>)}</div>)}</div><Button variant="secondary" size="lg" disabled={props.busy} onClick={()=>props.onPeriods(props.periods.length===2?[props.periods[0]!]:[...props.periods,{...props.periods[0]!,id:"second"}])}>{t(props.periods.length===2?"periodCurve.remove":"periodCurve.add")}</Button></details>
    {props.failure && <Text as="p" variant="bodyMedium" role="alert">{t("powerSkills.native.error")}</Text>}
    {!props.enabled && <Text as="p" variant="bodyMedium" tone="secondary">{t("powerSkills.native.preparing")}</Text>}
    <div className="native-twelve-controls"><label htmlFor={`${id}-duration`}><Text variant="bodyMedium">{t("periodCurve.duration")}</Text><DropdownSelect id={`${id}-duration`} label={t("periodCurve.duration")} value={String(duration)} onChange={next => setDuration(Number(next))} options={NATIVE_POWER_V2_TWELVE_SECONDS.map((seconds) => ({ value: String(seconds), label: label(seconds) }))} /></label><label htmlFor={`${id}-unit`}><Text variant="bodyMedium">{t("periodCurve.unit")}</Text><DropdownSelect id={`${id}-unit`} label={t("periodCurve.unit")} value={String(unit)} onChange={next => setUnit(next as "W"|"W/kg")} options={[{ value: String("W"), label: "W" }, { value: String("W/kg"), label: "W/kg" }]} /></label></div>
    {props.response ? <><Text as="p" variant="bodyMedium" tone="secondary">{t("powerSkills.native.clock")}{unit === "W/kg" ? ` ${t("periodCurve.weightBasis")}` : ""}</Text><div className="native-twelve-values">{props.periods.map((period, index) => <div key={period.id} className="space-y-3"><div><Text as="h4" variant="bodyMedium" weight={600}>{t(period.id === "recent" ? "powerSkills.recent" : period.id === "all" ? "powerSkills.allObserved" : "periodCurve.period", { n: index + 1 })}</Text><Text as="p" variant="bodyMedium" tone="secondary">{period.fromInclusiveMs === 0 ? t("powerSkills.through", { date: date(period.toExclusiveMs - 1) }) : `${date(period.fromInclusiveMs)} – ${date(period.toExclusiveMs - 1)}`}</Text></div>
      {(["measured", "storedNativeUnverified"] as const).map(origin => { const item = winner(index, duration, origin); return <div key={origin}><Text as="p" variant="bodyMedium" tone="secondary">{t(`powerSkills.native.${origin}`)}</Text>{item ? <Text as="p" variant="bodyLarge" weight={600}>{display(item)}</Text> : <Text as="p" variant="bodyMedium" tone="secondary">{t("powerSkills.native.unavailable")}</Text>}{item && <LocalizedLink className="native-twelve-link" to={`/activity/${encodeURIComponent(item.activityId)}`}>{t("powerSkills.native.source")}</LocalizedLink>}</div>; })}
      <Text as="p" variant="bodyMedium" tone="secondary">{props.response ? t("powerSkills.native.checked", { selected: props.response.periods[index]?.counts.selected ?? 0, checked: props.response.periods[index]?.counts.checked ?? 0 }) : t("powerSkills.native.notLoaded")}</Text>
    </div>)}</div></> : <Text as="p" variant="bodyMedium" tone="secondary">{t("powerSkills.native.notLoaded")}</Text>}
    {props.response && <details className="native-twelve-details"><summary>{t("periodCurve.details")}</summary><div className="space-y-3">{props.periods.flatMap((period,index)=>(["measured","storedNativeUnverified"] as const).map(origin=>{const item=winner(index,duration,origin),source=props.response!.sources.find(source=>source.candidate.activityId===item?.activityId);return item?.slot.witness ? <div key={`${period.id}-${origin}`} className="space-y-2"><Text as="p" variant="bodyMedium">{t(`powerSkills.native.${origin}`)} · {label(duration)}</Text><Text as="p" variant="bodyMedium" tone="secondary">{t("powerSkills.native.window",{from:item.slot.witness.windowStartElapsedMs/1000,through:item.slot.witness.windowEndElapsedMs/1000})}</Text>{source?.weight.state==="available"&&<Text as="p" variant="bodyMedium" tone="secondary">{t("periodCurve.weightWinner",{watts:item.slot.witness.maxAveragePowerW,kg:source.weight.weightKg})}</Text>}<LocalizedLink className="native-twelve-link" to={`/activity/${encodeURIComponent(item.activityId)}`}>{t("powerSkills.native.source")}</LocalizedLink></div>:null;}))}</div></details>}
    <details className="native-twelve-details"><summary>{t("powerSkills.table")}</summary><label className="native-twelve-controls" htmlFor={`${id}-origin`}><Text variant="bodyMedium">{t("powerSkills.native.tableOrigin")}</Text><DropdownSelect id={`${id}-origin`} label={t("powerSkills.native.tableOrigin")} value={String(tableOrigin)} onChange={next => setTableOrigin(next as "measured"|"storedNativeUnverified")} options={[{ value: String("measured"), label: t("powerSkills.native.measured") }, { value: String("storedNativeUnverified"), label: t("powerSkills.native.storedNativeUnverified") }]} /></label><div className="native-twelve-table-scroll"><table className="native-twelve-table"><caption>{t(`powerSkills.native.${tableOrigin}`)} · {unit}</caption><thead><tr><th>{t("periodCurve.duration")}</th>{props.periods.map(period => <th key={period.id}>{t(period.id === "recent" ? "powerSkills.recent" : "powerSkills.allObserved")}</th>)}</tr></thead><tbody>{NATIVE_POWER_V2_TWELVE_SECONDS.map(seconds => <tr key={seconds}><th scope="row">{label(seconds)}</th>{props.periods.map((period, index) => <td key={period.id}>{display(winner(index, seconds, tableOrigin))}</td>)}</tr>)}</tbody></table></div><Text as="p" variant="bodyMedium" tone="secondary">{t("powerSkills.native.missing")}</Text></details>
  </section>;
}
