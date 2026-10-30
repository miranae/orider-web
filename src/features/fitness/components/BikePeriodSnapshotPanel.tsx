import { useTranslation } from "react-i18next";
import type { PowerCurvePeriod } from "@shared/types/power-curve-periods";
import { useBikePeriodSnapshot } from "../../../hooks/useBikePeriodSnapshot";
import { analysisCapabilityAvailable } from "../../../services/analysisCapability";
import { useLocale } from "../../../contexts/LocaleContext";
import { formatDistance, formatElev } from "../../../utils/units";
import { formatElapsedBoundary } from "../../activity/detail/activityRangeSelection";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { Button, Select, Stack, Text } from "../../../theme";
import BikeSnapshotDensePower from "./BikeSnapshotDensePower";
export default function BikePeriodSnapshotPanel(props:{ownerUid:string;period:PowerCurvePeriod;historyOnly?:boolean}){
 const {t}=useTranslation("fitness");
 if(!analysisCapabilityAvailable("bikePeriods"))return null;
 return props.historyOnly?<details><summary>{t("bikeSnapshot.loadHistory")}</summary><Panel key={`${props.ownerUid}:${props.period.fromInclusive}:${props.period.toExclusive}`} {...props}/></details>:<Panel key={`${props.ownerUid}:${props.period.fromInclusive}:${props.period.toExclusive}`} {...props}/>;
}
function Panel({ownerUid,period,historyOnly=false}:{ownerUid:string;period:PowerCurvePeriod;historyOnly?:boolean}){
 const {t,i18n}=useTranslation("fitness"),{units}=useLocale(),snapshot=useBikePeriodSnapshot(ownerUid,{fromInclusive:period.fromInclusive,toExclusive:period.toExclusive}),r=snapshot.data,result=r?.result;
 return <section className="space-y-3" aria-label={t("bikeSnapshot.title")}>
  {!historyOnly&&<><Text as="h4" variant="subtitle">{t("bikeSnapshot.title")}</Text><Text as="p">{t("bikeSnapshot.intro")}</Text></>}
  {!historyOnly&&<Stack direction="row" wrap gap="var(--space-2)"><Button disabled={snapshot.running} onClick={()=>void(snapshot.canResume?snapshot.resume():snapshot.start())}>{t(snapshot.canResume?"bikeSnapshot.resume":"bikeSnapshot.start")}</Button>{snapshot.canResume&&<Button disabled={snapshot.running} variant="ghost" onClick={()=>void snapshot.start()}>{t("bikeSnapshot.restart")}</Button>}{snapshot.running&&<Button variant="ghost" onClick={snapshot.stop}>{t("bikeSnapshot.stop")}</Button>}</Stack>}
  <Button disabled={snapshot.running} variant="ghost" onClick={()=>void snapshot.loadHistory()}>{t("bikeSnapshot.loadHistory")}</Button>
  {snapshot.history&&<><ul>{snapshot.history.items.map((item,index)=><li key={item.runId}><Button disabled={snapshot.running} variant="neutral" aria-pressed={r?.runId===item.runId} onClick={()=>void snapshot.openSaved(item.runId)}>{t("bikeSnapshot.historyItem",{number:index+1,count:item.representatives})} · {new Intl.DateTimeFormat(i18n.language,{timeZone:"Asia/Seoul",dateStyle:"short",timeStyle:"medium"}).format(item.asOf)} KST{r?.runId===item.runId&&<> · {t("bikeSnapshot.selected")}</>}</Button></li>)}</ul>{snapshot.history.nextCursor&&<Button disabled={snapshot.running} onClick={()=>void snapshot.loadHistory(true)}>{t("bikeSnapshot.moreHistory")}</Button>}</>}
  {snapshot.running&&<Text as="p" role="status">{historyOnly?t("bikeSnapshot.historyLoading"):t("bikeSnapshot.progress",{count:snapshot.progressScanned??r?.scanned??0})}</Text>}
  {snapshot.error&&<Text as="p" role="alert">{t(snapshot.errorKind==="limit"?"bikeSnapshot.identityLimit":snapshot.errorKind==="invalidated"?"bikeSnapshot.invalidated":"bikeSnapshot.error")}</Text>}
  {r&&["expired","invalidated"].includes(r.state)&&<Text as="p" role="status">{t("bikeSnapshot.invalidated")}</Text>}
  {(snapshot.previousResults?.length??0)>0&&<label>{t("bikeSnapshot.history")}<Select value={snapshot.selectedRun??"current"} onChange={event=>snapshot.selectPrevious(event.target.value==="current"?null:event.target.value)}><option value="current">{t("bikeSnapshot.latest")}</option>{snapshot.previousResults.map(old=><option key={old.runId} value={old.runId}>{new Intl.DateTimeFormat(i18n.language,{timeZone:"Asia/Seoul",dateStyle:"short",timeStyle:"medium"}).format(old.asOf)} KST</option>)}</Select></label>}
  {result&&<>
   {(snapshot.running||snapshot.error)&&<Text as="p" role="status">{t("bikeSnapshot.previousResult")}</Text>}
   {r?.currentWinnerRevisionChanged&&<Text as="p" role="status">{t("bikeSnapshot.sourceChanged")}</Text>}
   <Text as="p">{t("bikeSnapshot.basis",{count:r!.scanned,time:new Intl.DateTimeFormat(i18n.language,{timeZone:"Asia/Seoul",dateStyle:"short",timeStyle:"short"}).format(r!.asOf)+" KST"})}</Text>
   <div>{(["distanceM","movingTimeSec","elevationGainM"] as const).map(key=>{const total=result.totals[key],format=(value:number)=>key==="distanceM"?formatDistance(value,units):key==="movingTimeSec"?formatElapsedBoundary(value):formatElev(value,units);return <section key={key} className="space-y-2">
    <Text as="p" weight={600}>{t(`bikeSnapshot.metrics.${key}`)} · {total.totalValue===null?"—":format(total.totalValue)}</Text>
    <Text as="p">{t("bikeSnapshot.coverage",{known:total.knownActivityCount,missing:total.missingActivityCount,fallback:total.summaryFallbackCount})}</Text>
    {total.totalValue===null&&total.observedValue!==null&&<Text as="p">{t("bikeSnapshot.observed",{value:format(total.observedValue)})}</Text>}
   </section>;})}</div>
   <Text as="h5" weight={600}>{t("bikeSnapshot.power")}</Text><Text as="p">{t(result.power.status==="complete"?"bikeSnapshot.powerComplete":"bikeSnapshot.powerPartial")}</Text>
   <Text as="p">{t(result.power.weightNormalized?.status==="complete"?"bikeSnapshot.weightComplete":"bikeSnapshot.weightPartial")}</Text>
   {result.power.weightNormalized&&<Text as="p">{t("periodCurve.weightCoverage",{...result.power.weightNormalized.weightCounts})}</Text>}
   <ul>{result.power.points.map(point=>{const weight=result.power.weightNormalized?.points.find(p=>p.durationSeconds===point.durationSeconds);return <li key={point.durationSeconds}>
    <LocalizedLink to={`/activity/${encodeURIComponent(point.sourceActivityId)}`}>{formatElapsedBoundary(point.durationSeconds)} · {point.watts.toFixed(1)} W</LocalizedLink>
    {weight&&<> · <LocalizedLink to={`/activity/${encodeURIComponent(weight.sourceActivityId)}`}>{weight.wattsPerKg.toFixed(2)} W/kg</LocalizedLink></>}
   </li>;})}</ul><Text as="p" variant="caption">{t("bikeSnapshot.weightBasis")}</Text>
   <BikeSnapshotDensePower ownerUid={ownerUid} power={result.power}/>
   <Text as="p">{t("bikeSnapshot.zonesCoverage",{hr:result.heartRate.eligibleActivityCount,power:result.powerZones.eligibleActivityCount,count:r!.representatives})}</Text>
   {r!.zoneGroups.map(zone=><section key={zone.id}><Text as="p" weight={600}>{zone.kind==="power"?t("bikeSnapshot.ftp",{ftp:zone.group.ftp,source:zone.group.powerSource}):t("bikeSnapshot.hr",{bpm:zone.group.boundaries.referenceBpm})}</Text><Text as="p">{zone.group.seconds.map((seconds,i)=>`Z${i+1} ${formatElapsedBoundary(seconds)}`).join(" · ")}</Text></section>)}
   <Button disabled={snapshot.running} variant="ghost" onClick={()=>void snapshot.zones()}>{t(r!.nextZone?"bikeSnapshot.moreZones":"bikeSnapshot.zones")}</Button>
  </>}
 </section>;
}
