import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { BikeSnapshotPowerResult } from "@shared/types/bike-period-snapshot";
import { usePeriodControls } from "../../../hooks/usePeriodControls";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { DropdownSelect, Stack, Text } from "../../../theme";
import { trainingCalendarDate } from "../../../services/trainingComparisonCalendar";
import { formatElapsedBoundary } from "../../activity/detail/activityRangeSelection";
import { POWER_DURATION_GRID } from "../../../services/powerCurvePeriods";
function durationControl(value:unknown):{duration:number}|null{
 if(!value||typeof value!=="object"||Object.keys(value).length!==1||!('duration' in value)||!POWER_DURATION_GRID.includes(Number(value.duration))||typeof value.duration!=="number")return null;
 return{duration:value.duration};
}
export default function BikeSnapshotDensePower({power,ownerUid}:{power:BikeSnapshotPowerResult;ownerUid:string}){
 const {t}=useTranslation("fitness"),id=useId();
 const [control,setControl]=usePeriodControls(ownerUid,`bike-snapshot-duration:${power.fromInclusive}:${power.toExclusive}`,()=>({duration:300}),durationControl);
 const raw=power.powerDurationObservations,normalized=power.weightNormalized?.powerDurationObservations;
 const durations=[...new Set([...(raw?.points??[]),...(normalized?.points??[])].map(p=>p.durationSeconds))].sort((a,b)=>a-b);
 if(!raw&&!normalized)return null;
 const selected=durations.includes(control.duration)?control.duration:durations[0],w=raw?.points.find(p=>p.durationSeconds===selected),kg=normalized?.points.find(p=>p.durationSeconds===selected);
 return <section aria-label={t("densePeriod.title")}><Stack gap="var(--space-2)">
  <Text as="h5" weight={600}>{t("densePeriod.title")}</Text>
  {durations.length>0&&<DropdownSelect id={id} label={t("periodCurve.duration")} value={String(selected)} onChange={value=>setControl({duration:Number(value)})} options={durations.map(seconds=>({value:String(seconds),label:formatElapsedBoundary(seconds)}))}/>}
  <Text>{t(!raw?"densePeriod.unknown":raw.partial?"densePeriod.partial":"densePeriod.complete")}</Text>
  <Text>{w?`${w.maxAveragePowerW} W`:"— W"}</Text>{w&&<LocalizedLink to={`/activity/${encodeURIComponent(w.sourceActivityId)}`}>{t("periodCurve.source",{date:trainingCalendarDate(w.startTime)})} · W</LocalizedLink>}
  <Text>{kg?`${kg.maxAveragePowerWPerKg.toFixed(2)} W/kg`:"— W/kg"}</Text>{kg&&<><Text>{t("periodCurve.weightWinner",{watts:kg.maxAveragePowerW,kg:kg.weightKg})}</Text><LocalizedLink to={`/activity/${encodeURIComponent(kg.sourceActivityId)}`}>{t("periodCurve.source",{date:trainingCalendarDate(kg.startTime)})} · W/kg</LocalizedLink></>}
  {normalized&&<Text>{t(normalized.partial?"bikeSnapshot.weightPartial":"bikeSnapshot.weightComplete")}</Text>}
 </Stack></section>;
}
