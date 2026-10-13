import { NATIVE_POWER_V2_TWELVE_SECONDS } from "@shared/types/stage-native-power-v2-twelve";
import type { NativePowerTwelveResponse, NativePowerTwelveWinner, NativePowerTwelvePeriodResult } from "@shared/types/stage-native-power-v2-twelve";
/** 스칼라 증거를 비교한다. 센서 원본 시계 검증이나 계정 전체 최고기록을 만들지 않는다. */
export function nativeTwelveExactWinner(response: NativePowerTwelveResponse, periodIndex: number, durationSeconds: number, origin: "measured"|"stored_native_watts_unverified", unit: "W"|"W/kg"): NativePowerTwelveWinner|null {
 const period=response.periods[periodIndex]?.period;if(!period)return null;
 const groups=new Map<string,NativePowerTwelveResponse['sources']>();
 for(const source of response.sources){const group=groups.get(source.physicalGroupBinding)??[];groups.set(source.physicalGroupBinding,[...group,source]);}
 let best:{winner:NativePowerTwelveWinner;n:bigint;d:bigint;date:number}|null=null;
 for(const sources of groups.values()){
  if(sources.some(source=>source.unresolvedKnownTwin))continue;
  const preferred=[...sources].sort((a,b)=>Number(b.powerSource==="measured")-Number(a.powerSource==="measured")||b.candidate.originEpochMs-a.candidate.originEpochMs||(a.candidate.activityId<b.candidate.activityId?-1:1))[0]!;
  if(preferred.powerSource!==origin||preferred.candidate.originEpochMs<period.fromInclusiveMs||preferred.candidate.originEpochMs>=period.toExclusiveMs||!preferred.snapshotRevision)continue;
  const slot=preferred.slots.find(value=>value.durationSeconds===durationSeconds);if(slot?.state!=="available"||!slot.witness||unit==="W/kg"&&!slot.weightRatio)continue;
  const n=BigInt(unit==="W"?slot.witness.energyNumerator:slot.weightRatio!.numerator),d=BigInt(unit==="W"?slot.witness.energyDenominator:slot.weightRatio!.denominator);
  const date=preferred.candidate.originEpochMs,activityId=preferred.candidate.activityId;
  if(!best||n*best.d>best.n*d||n*best.d===best.n*d&&(date>best.date||date===best.date&&activityId<best.winner.activityId))best={winner:{activityId,snapshotRevision:preferred.snapshotRevision,slot},n,d,date};
 }
 return best?.winner??null;
}

export function nativeTwelveExactPeriods(response: NativePowerTwelveResponse): NativePowerTwelvePeriodResult[] {
 const groups=new Map<string,NativePowerTwelveResponse['sources']>();
 for(const source of response.sources)groups.set(source.physicalGroupBinding,[...(groups.get(source.physicalGroupBinding)??[]),source]);
 const unresolved=[...groups.values()].filter(group=>group.some(s=>s.unresolvedKnownTwin)).flat();
 const frozen=[...groups.values()].filter(group=>!group.some(s=>s.unresolvedKnownTwin)).map(group=>[...group].sort((a,b)=>Number(b.powerSource==="measured")-Number(a.powerSource==="measured")||b.candidate.originEpochMs-a.candidate.originEpochMs||(a.candidate.activityId<b.candidate.activityId?-1:a.candidate.activityId>b.candidate.activityId?1:0))[0]!);
 return response.periods.map(({period},index)=>{
  const within=(source:NativePowerTwelveResponse['sources'][number])=>source.candidate.originEpochMs>=period.fromInclusiveMs&&source.candidate.originEpochMs<period.toExclusiveMs;
  const checked=response.sources.filter(within),eligible=frozen.filter(within);
  return {period,counts:{selected:checked.length,checked:checked.length,available:checked.filter(s=>s.state==="available").length,snapshotMissing:checked.filter(s=>s.state==="snapshot_missing").length,unresolvedPhysicalGroups:new Set(unresolved.filter(within).map(s=>s.physicalGroupBinding)).size},rows:NATIVE_POWER_V2_TWELVE_SECONDS.map(durationSeconds=>{
   const slots=eligible.map(source=>source.slots.find(s=>s.durationSeconds===durationSeconds)!);
   const origin=(source:"measured"|"stored_native_watts_unverified")=>({watts:nativeTwelveExactWinner(response,index,durationSeconds,source,"W"),wattsPerKg:nativeTwelveExactWinner(response,index,durationSeconds,source,"W/kg")});
   return {durationSeconds,measured:origin("measured"),storedNativeUnverified:origin("stored_native_watts_unverified"),counts:{available:slots.filter(s=>s.state==="available").length,shortWindow:slots.filter(s=>s.state==="no_continuous_window").length,snapshotMissing:slots.filter(s=>s.state==="snapshot_missing").length,weightUnavailable:slots.filter(s=>s.state==="available"&&!s.weightRatio).length}};
  })};
 });
}
export function nativeTwelveDisplayValue(value: number|null|undefined, unit:"W"|"W/kg"): string {
 if(value==null)return "—";
 const quantum=unit==="W"?0.1:0.01;
 return `${value>0&&value<quantum?`<${quantum}`:value.toFixed(unit==="W"?1:2)} ${unit}`;
}
