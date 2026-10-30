import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { NativePowerV2ReaderResponse } from "@shared/types/stage-native-power-v2-publication";
import { Button, Input, Select, Text } from "../../../theme";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { formatElapsedBoundary } from "./activityRangeSelection";
import { nativeTwelveDisplayValue } from "../../fitness/models/nativePowerTwelve";
export interface NativePowerV2DurationViewProps {activityId:string;draft:string;metadata:NativePowerV2ReaderResponse|null;result:NativePowerV2ReaderResponse|null;busy:boolean;failure:boolean;canCalculate:boolean;onDraft:(value:string)=>void;onConfirm:()=>void;onCalculate:()=>void;onCancel:()=>void;previousResult?:boolean;history?:Array<{id:string;duration:number;calculatedAt:number}>;selectedResultId?:string;selectResult?:(id:string)=>void}
export function NativePowerV2DurationView(props:NativePowerV2DurationViewProps) {
 const {t}=useTranslation("activity"),id=useId();
 return <details className="activity-growth-evidence text-[length:var(--fs-md)]"><summary className="cursor-pointer py-3 font-semibold">{t("nativePowerV2.title")}</summary><div className="space-y-3 pt-3">
  <Text as="p" variant="bodyMedium" tone="secondary">{t("nativePowerV2.scope")}</Text>
  <label className="block space-y-2" htmlFor={id}><Text variant="bodyMedium">{t("nativePowerV2.duration")}</Text><Input id={id} inputMode="numeric" value={props.draft} onChange={event=>props.onDraft(event.target.value)} /></label>
  <Text as="p" variant="bodyMedium" tone="secondary">{props.metadata?.bounds?t("nativePowerV2.continuous",{duration:formatElapsedBoundary(props.metadata.bounds.longestContinuousMs/1000)}):t("nativePowerV2.inputExample")}</Text>
  {!props.metadata&&<Text as="p" variant="bodyMedium" tone="secondary">{t("nativePowerV2.confirmFirst")}</Text>}
  <div className="flex flex-wrap gap-3"><Button size="lg" variant="secondary" disabled={props.busy||!/^\d{1,6}$/u.test(props.draft)||Number(props.draft)<1||Number(props.draft)>604800} onClick={props.onConfirm}>{t("nativePowerV2.confirm")}</Button><Button size="lg" variant="primary" disabled={!props.canCalculate} onClick={props.onCalculate}>{t("nativePowerV2.calculate")}</Button><Button size="lg" variant="ghost" onClick={props.onCancel}>{t("nativePowerV2.cancel")}</Button></div>
  {props.busy&&<Text as="p" variant="bodyMedium" role="status">{t("nativePowerV2.loading")}</Text>}
  {props.failure&&<Text as="p" variant="bodyMedium" role="alert">{t("nativePowerV2.reconfirm")}</Text>}
  {props.metadata&&props.metadata.state!=="available"&&<Text as="p" variant="bodyMedium">{t("nativePowerV2.unavailable")}</Text>}
  {!!props.history?.length&&<label className="block space-y-2" htmlFor={`${id}-history`}><Text variant="bodyMedium">{t("nativePowerV2.savedResults")}</Text><Select id={`${id}-history`} value={props.selectedResultId} onChange={event=>props.selectResult?.(event.target.value)}>{props.history.map((entry,index)=><option key={entry.id} value={entry.id}>{t("nativePowerV2.savedResult",{number:index+1,duration:formatElapsedBoundary(entry.duration)})}</option>)}</Select></label>}
  {props.previousResult&&<Text as="p" variant="bodyMedium" tone="secondary">{t("nativePowerV2.previousResult")}</Text>}
  {props.result?.witness?<section className="space-y-2" aria-label={t("nativePowerV2.result")}><Text as="p" variant="dataMedium" weight={600}>{nativeTwelveDisplayValue(props.result.witness.maxAveragePowerW,"W")} · {formatElapsedBoundary(props.result.witness.durationMs/1000)}</Text><Text as="p" variant="bodyMedium">{t("nativePowerV2.window",{from:formatElapsedBoundary(props.result.witness.windowStartElapsedMs/1000),through:formatElapsedBoundary(props.result.witness.windowEndElapsedMs/1000)})}</Text><Text as="p" variant="bodyMedium" tone="secondary">{t(props.result.witness.powerSource==="measured"?"nativePowerV2.measured":"nativePowerV2.stored")}</Text><LocalizedLink className="inline-flex min-h-[calc(var(--dim-button-height)+var(--space-1))] items-center underline" to={`/activity/${encodeURIComponent(props.activityId)}`}>{t("nativePowerV2.source")}</LocalizedLink></section>:props.result&&<Text as="p" variant="bodyMedium">{t("nativePowerV2.unavailable")}</Text>}
  <Text as="p" variant="bodyMedium" tone="secondary">{t("nativePowerV2.clock")}</Text>
  <details><summary className="cursor-pointer py-3">{t("nativePowerV2.proof")}</summary><Text as="p" variant="bodyMedium" tone="secondary">{t("nativePowerV2.map")}</Text></details>
 </div></details>;
}
