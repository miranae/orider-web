import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import type { Activity } from "@shared/types";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { useActivityRouteHistorySnapshot } from "../../../hooks/useActivityRouteHistorySnapshot";
import { getDiscipline } from "../../../utils/disciplineFilter";
import { Button, Stack, Text } from "../../../theme";
export default function ActivityRouteHistorySnapshotPanel({activity,observedMetricsIdentity}:{activity:Activity;observedMetricsIdentity:string}){
 const {t,i18n}=useTranslation("activity"),location=useLocation(),sport=getDiscipline(activity.type);
 const query=useActivityRouteHistorySnapshot(activity.userId,activity.id,activity.deletedAt==null&&(sport==="bike"||sport==="run")?sport:null,JSON.stringify([(activity as Activity & { activityRevision?: string }).activityRevision,(activity as Activity & { sourceRevision?: string }).sourceRevision,(activity as Activity & { sourceContentDigest?: string }).sourceContentDigest,activity.contentRevision,activity.deletedAt,activity.startTime,activity.type,observedMetricsIdentity]));
 const data=query.data,best=data?.state==="complete"?data.best:null;
 const date=(ms:number)=>new Intl.DateTimeFormat(i18n.language,{timeZone:"Asia/Seoul",dateStyle:"short",timeStyle:"short"}).format(ms);
 const elapsed=(sec:number)=>{const ticks=Math.round(sec*10);return `${Math.floor(ticks/36000)}:${String(Math.floor(ticks/600)%60).padStart(2,"0")}:${((ticks%600)/10).toFixed(1).padStart(4,"0")}`;};
 if(!query.available)return null;
 return <section aria-label={t("routeHistory.title")} className="matched-route-group"><details><summary><Text weight={600}>{t("routeHistory.title")}</Text></summary><Stack gap="var(--space-3)">
  <Text as="p">{t("routeHistory.scope")}</Text>
  <Stack direction="row" wrap gap="var(--space-2)"><Button variant="outline" disabled={query.running} onClick={()=>void query.start()}>{t(data?"routeHistory.restart":"routeHistory.start")}</Button>
   {query.canRecover&&<Button disabled={query.running} onClick={()=>void query.recover()}>{t("routeHistory.recover")}</Button>}
   {data&&(data.state!=="complete"||query.status==="error")&&<Button disabled={query.running} loading={query.status==="loading"} onClick={()=>void query.advance()}>{t(query.status==="error"?"routeHistory.retry":"routeHistory.continue")}</Button>}
   {(data||query.status==="loading")&&<Button variant="ghost" onClick={query.stop}>{t(data?.state==="complete"&&!query.running?"routeHistory.close":"routeHistory.stop")}</Button>}
  </Stack>
  {query.status!=="idle"&&<Text role="status">{t(`routeHistory.status.${query.status==="ready"?(data?.state==="complete"?"complete":"paused"):query.status}`)}</Text>}
  {data&&<><Text>{t("routeHistory.counts",{scanned:data.scanned,candidates:data.candidateCount,excluded:data.excluded,unresolved:data.unresolved})}</Text><Text variant="caption">{t("routeHistory.time",{asOf:date(data.asOf),expires:date(data.expiresAt)})}</Text>
   {(data.state!=="complete"||query.status==="ready")&&<Text>{t(data.state==="complete"?`routeHistory.best.${data.bestStatus}`:`routeHistory.phase.${data.state}`)}</Text>}</>}
  {best&&best.bestElapsedSec!==null&&<><Text as="h4" weight={600}>{t("routeHistory.elapsed",{time:elapsed(best.bestElapsedSec)})}</Text><Text>{t("routeHistory.quality",{eligible:best.eligibleGroups,excluded:best.excludedGroups,ambiguous:best.ambiguousGroups,unavailable:best.unavailableGroups})}</Text><Text>{t("routeHistory.sources",{missing:best.states.missing,unsupported:best.states.unsupported,changed:best.states.changed})}</Text><ul>{best.bestActivityIds.map((id,index)=><li key={id}><LocalizedLink to={`/activity/${encodeURIComponent(id)}`} state={{routeInventoryReturn:{uid:activity.userId,pathname:location.pathname,search:location.search,hash:location.hash}}}>{t("routeHistory.source",{index:index+1})}</LocalizedLink></li>)}</ul>{best.tiesTruncated&&<Text>{t("routeHistory.ties",{count:best.tieCount,shown:best.bestActivityIds.length})}</Text>}</>}
  <Text variant="caption" tone="secondary">{t("routeHistory.limit")}</Text>
 </Stack></details></section>;
}
