import { PowerEffortPreferencePanel } from "./PowerEffortPreferencePanel";
import { useState } from "react";
import type { NativePowerTwelvePeriod } from "@shared/types/stage-native-power-v2-twelve";
import { useNativePowerV2Twelve } from "../../../hooks/useNativePowerV2Twelve";
import { NativePowerTwelvePersonalView, type NativePowerLoadedActivity } from "./NativePowerTwelvePersonalView";
export function NativePowerTwelvePersonalPanel({ownerUid,activities,enabled}:{ownerUid:string;activities:readonly NativePowerLoadedActivity[];enabled:boolean}) {
 const [selectedIds,onSelect]=useState<string[]>([]);
 const [periods,onPeriods]=useState<NativePowerTwelvePeriod[]>(()=>{const now=Date.now();return [{id:"recent",fromInclusiveMs:now-56*86400000,toExclusiveMs:now},{id:"all",fromInclusiveMs:0,toExclusiveMs:now}];});
 const model=useNativePowerV2Twelve(ownerUid,activities,selectedIds,periods,enabled);
 return <><NativePowerTwelvePersonalView {...model} enabled={model.available} activities={activities} selectedIds={selectedIds} periods={periods} onSelect={onSelect} onPeriods={onPeriods} onInspect={model.inspect} onLoad={model.load}/>{model.available && <PowerEffortPreferencePanel ownerUid={ownerUid} mode="stage_power_effort_adjusted_native12" activityIds={selectedIds} periods={periods} scopeKey={JSON.stringify(activities.map(a=>[a.activityId,a.headBinding]))}/>}</>;
}
