import {useState} from "react";
import type {Activity} from "@shared/types";
import {useNativePowerV2Duration} from "../../../hooks/useNativePowerV2Duration";
import {NativePowerV2DurationView} from "./NativePowerV2DurationView";
export default function NativePowerV2DurationPanel({activity,scopeKey=""}:{activity:Activity;scopeKey?:string}) {
 const [draft,onDraft]=useState("300"),model=useNativePowerV2Duration(activity,draft,scopeKey);
 if(!model.available)return null;
 return <NativePowerV2DurationView {...model} activityId={activity.id} draft={draft} onDraft={onDraft} onConfirm={model.confirm} onCalculate={model.calculate} onCancel={model.cancel}/>;
}
