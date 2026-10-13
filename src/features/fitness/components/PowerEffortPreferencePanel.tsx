import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { StagePowerEffortAdjustedRequest, StagePowerEffortPeriod } from "@shared/types/stage-power-effort-adjusted";
import { usePowerEffortPreferences } from "../../../hooks/usePowerEffortPreferences";
import { Button, Select, Text } from "../../../theme";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { formatElapsedBoundary } from "../../activity/detail/activityRangeSelection";

export interface PowerEffortPreferencePanelProps { ownerUid:string; mode:StagePowerEffortAdjustedRequest["mode"]; activityIds:readonly string[]; periods:readonly StagePowerEffortPeriod[]; durationSeconds?:number; scopeKey?:string }
function value(v:number|null) {return v===null?"—":v>0&&v<0.01?"<0.01":new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(v);}
export function PowerEffortPreferencePanel(props:PowerEffortPreferencePanelProps) {
  const {t,i18n}=useTranslation("fitness");
  const request:StagePowerEffortAdjustedRequest|null=props.activityIds.length?{version:1,mode:props.mode,activityIds:[...props.activityIds],periods:props.periods.map(p=>({...p})),...(props.mode==="stage_power_effort_adjusted_v1"?{durationSeconds:props.durationSeconds}:{})}:null;
  const tool=usePowerEffortPreferences(props.ownerUid,request,props.scopeKey);
  const [duration,setDuration]=useState(props.durationSeconds??300),[unit,setUnit]=useState<"W"|"W/kg">("W");
  if(!tool.available)return null;
  const response=tool.response;
  const sources=response?("sources" in response?response.sources:[{...response,originEpochMs:null}]):[];
  const durations=[...new Set(sources.flatMap(s=>s.points.map(p=>p.durationSeconds)))].sort((a,b)=>a-b),selected=durations.includes(duration)?duration:durations[0];
  const date=(time:number|null)=>time===null?t("powerEffort.savedActivity"):new Intl.DateTimeFormat(i18n.language,{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(time);
  return <details className="activity-growth-evidence text-[length:var(--fs-md)]">
    <summary className="cursor-pointer py-3 font-semibold">{t("powerEffort.title")}</summary>
    <div className="space-y-4 pt-3">
      <Text as="p" variant="bodyMedium" tone="secondary">{t("powerEffort.scope")}</Text>
      <div className="flex flex-wrap gap-3"><Button size="lg" disabled={!request||tool.busy||!!tool.pending} onClick={()=>void tool.refresh()}>{t("powerEffort.load")}</Button><Button size="lg" variant="ghost" disabled={tool.busy||!!tool.pending} onClick={()=>void tool.reloadHandles()}>{t("powerEffort.saved")}</Button></div>
      {tool.busy&&<Text as="p" variant="bodyMedium" role="status">{t(tool.pending?"powerEffort.saving":"powerEffort.loading")}</Text>}
      {tool.outcome&&<Text as="p" variant="bodyMedium" role="status">{t(tool.outcome==="stored_verified"?"powerEffort.confirmed":tool.outcome==="commit_outcome_unknown"?"powerEffort.unknown":"powerEffort.pending")}</Text>}
      {tool.failure&&<Text as="p" variant="bodyMedium" role="alert">{t(tool.pending?"powerEffort.unknown":"powerEffort.error")}</Text>}
      {tool.pending&&<Button size="lg" variant="outline" disabled={tool.busy} onClick={()=>void tool.retry()}>{t("powerEffort.retry")}</Button>}
      {tool.busy&&<Button size="lg" variant="ghost" onClick={tool.cancel}>{t("powerEffort.cancel")}</Button>}
      {tool.cancelledUnknown&&<Text as="p" variant="bodyMedium" role="status">{t("powerEffort.cancelledUnknown")}</Text>}
      {tool.handles.length>0&&<details><summary className="cursor-pointer py-3">{t("powerEffort.restoreSaved")}</summary><div className="space-y-2">{tool.handles.map((h,i)=><Button key={JSON.stringify(h)} size="lg" variant="outline" disabled={tool.busy||!!tool.pending} onClick={()=>void tool.inspectHandle(h)}>{t("powerEffort.inspectSaved",{n:i+1})}</Button>)}</div></details>}
      {response&&<>
        <div className="flex flex-wrap gap-3"><label className="space-y-2"><Text as="span" variant="bodyMedium">{t("powerEffort.duration")}</Text><Select value={selected??""} onChange={e=>setDuration(Number(e.target.value))}>{durations.map(d=><option key={d} value={d}>{formatElapsedBoundary(d)}</option>)}</Select></label><label className="space-y-2"><Text as="span" variant="bodyMedium">{t("powerEffort.unit")}</Text><Select value={unit} onChange={e=>setUnit(e.target.value==="W/kg"?"W/kg":"W")}><option>W</option><option>W/kg</option></Select></label></div>
        {unit==="W/kg"&&<Text as="p" variant="bodyMedium" tone="secondary">{t("powerEffort.weight")}</Text>}
        {"periods" in response&&<section className="space-y-3" aria-label={t("powerEffort.adjusted")}><Text as="h4" variant="bodyMedium" weight={600}>{t("powerEffort.adjusted")}</Text>{response.periods.map(p=><div key={p.period.id} className="space-y-2"><Text as="p" variant="bodyMedium" weight={600}>{date(p.period.fromInclusiveMs)} – {date(p.period.toExclusiveMs-1)}</Text>{p.rows.filter(r=>r.durationSeconds===selected).map(r=>{const winner=unit==="W"?r.watts:r.wattsPerKg;return <div key={`${r.basisVersion}:${r.powerSource}`} className="space-y-1"><Text as="p" variant="bodyMedium" tone="secondary">{t(`powerEffort.basis.${r.basisVersion}`)} · {t(`powerEffort.origin.${r.powerSource}`)}</Text><Text as="p" variant="dataMedium" weight={600}>{value(winner?(unit==="W"?winner.watts:winner.wattsPerKg):null)} {unit}</Text>{winner&&<LocalizedLink className="inline-flex min-h-[var(--dim-button-height)] items-center underline" to={`/activity/${encodeURIComponent(winner.activityId)}`}>{date(sources.find(s=>s.activityId===winner.activityId)?.originEpochMs??null)}</LocalizedLink>}<Text as="p" variant="bodyMedium" tone="secondary">{t("powerEffort.briefCounts",r.counts)}</Text><details><summary className="cursor-pointer py-3">{t("powerEffort.evidence")}</summary><Text as="p" variant="bodyMedium" tone="secondary">{t("powerEffort.counts",r.counts)}</Text></details></div>;})}</div>)}</section>}
        <section className="space-y-3" aria-label={t("powerEffort.manage")}><Text as="h4" variant="bodyMedium" weight={600}>{t("powerEffort.manage")}</Text>{sources.map(s=><div key={s.activityId} className="space-y-2"><LocalizedLink className="inline-flex min-h-[var(--dim-button-height)] items-center underline" to={`/activity/${encodeURIComponent(s.activityId)}`}>{date(s.originEpochMs)}</LocalizedLink>{s.points.filter(p=>p.durationSeconds===selected).map(p=>{const ready=p.excluded?p.restoreReady:p.excludeReady;return <div key={`${p.basisVersion}:${p.powerSource}`} className="space-y-2"><Text as="p" variant="bodyMedium">{t(`powerEffort.basis.${p.basisVersion}`)} · {t(`powerEffort.origin.${p.powerSource}`)} · {t(p.excluded?"powerEffort.excluded":`powerEffort.state.${p.state}`)}</Text><Text as="p" variant="bodyMedium" weight={600}>{formatElapsedBoundary(p.durationSeconds)} · {value(unit==="W"?p.originalWatts:p.originalWattsPerKg)} {unit}</Text><details><summary className="cursor-pointer py-3">{t("powerEffort.original")}</summary><Text as="p" variant="bodyMedium">{p.originalWatts===null?"—":String(p.originalWatts)} W · {p.originalWattsPerKg===null?"—":String(p.originalWattsPerKg)} W/kg</Text></details>{ready&&<Button size="lg" variant="outline" disabled={tool.busy||!!tool.pending} onClick={()=>void tool.change(ready)}>{t(p.excluded?"powerEffort.restore":"powerEffort.exclude")}</Button>}</div>;})}</div>)}</section>
        {sources.every(s=>s.points.length===0)&&<Text as="p" variant="bodyMedium">{t("powerEffort.empty")}</Text>}
      </>}
    </div>
  </details>;
}
