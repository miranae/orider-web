import { useId } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Activity } from '@shared/types';
import { usePeriodControls } from '../../../hooks/usePeriodControls';
import { useActivityMatchedRouteInventory } from '../../../hooks/useActivityMatchedRouteInventory';
import { getDiscipline } from '../../../utils/disciplineFilter';
import { LocalizedLink } from '../../../components/LocalizedLink';
import { Button, Input, Select, Text } from '../../../theme';
import './activity-matched-route-group.css';
interface Controls { open: boolean; observed: boolean; year: string }
export function validRouteInventoryControls(value: unknown): Controls | null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Controls;
 return Object.keys(v).length===3&&typeof v.open==='boolean'&&typeof v.observed==='boolean'&&typeof v.year==='string'&&(v.year===''||/^\d{4}$/.test(v.year)&&Number(v.year)>=1970&&Number(v.year)<=new Date(Date.now()+32400000).getUTCFullYear())?v:null;
}
export default function ActivityRouteInventoryPanel({activity,observedMetricsIdentity}:{activity:Activity;observedMetricsIdentity:string}){
 const {t,i18n}=useTranslation('activity'),location=useLocation(),id=useId();
 const [controls,setControls]=usePeriodControls<Controls>(activity.userId,`route-inventory-${activity.id}`,()=>({open:false,observed:activity.source==='orider',year:''}),validRouteInventoryControls);
 const sport=getDiscipline(activity.type),discipline=sport==='bike'||sport==='run'?sport:null;
 const source=activity as Activity&{activityRevision?:string;sourceRevision?:unknown;sourceContentDigest?:unknown};
 const head=JSON.stringify([activity.id,source.activityRevision,source.sourceRevision,source.sourceContentDigest,activity.contentRevision,activity.contentSelectedRevision,activity.startTime,activity.endTime,activity.deletedAt,observedMetricsIdentity]);
 const valid=validRouteInventoryControls(controls)!==null;
 const query=useActivityMatchedRouteInventory(activity.userId,activity.id,valid&&activity.deletedAt==null?discipline:null,head,controls.observed&&activity.source==='orider'?'observed_native':'complete',controls.year&&valid?Number(controls.year):null);
 const rows=query.pages.flatMap(page=>page.members),last=query.pages[query.pages.length-1],scanned=query.pages.reduce((n,page)=>n+page.inventory.scannedCount,0);
 const date=(time:number)=>new Intl.DateTimeFormat(i18n.language,{timeZone:'Asia/Seoul',dateStyle:'medium'}).format(time);
 // Invalid text must remain editable even though it cannot initiate a query.
 if(!query.available&&valid)return null;
 return <section className="matched-route-group" aria-label={t('routeInventory.title')}><details open={controls.open} onToggle={event=>{const open=event.currentTarget.open;if(open!==controls.open)setControls(v=>({...v,open}));}}>
  <summary><Text variant="bodyMedium" weight={600}>{t('routeInventory.title')}</Text></summary>
  <div className="matched-route-group-body">
   <Text as="p" tone="secondary">{t('routeInventory.scope')}</Text>
   <label htmlFor={`${id}-year`}>{t('routeInventory.year')}<Input id={`${id}-year`} type="number" min={1970} max={new Date(Date.now()+32400000).getUTCFullYear()} placeholder={t('routeInventory.allYears')} value={controls.year} onChange={e=>setControls(v=>({...v,year:e.target.value}))}/></label>
   {activity.source==='orider'&&<label htmlFor={`${id}-mode`}>{t('routeGroup.mode')}<Select id={`${id}-mode`} value={controls.observed?'observed_native':'complete'} onChange={e=>setControls(v=>({...v,observed:e.target.value==='observed_native'}))}><option value="observed_native">{t('routeGroup.observedTitle')}</option><option value="complete">{t('routeGroup.completeMode')}</option></Select></label>}
   {!valid&&<Text role="alert">{t('routeInventory.invalidYear')}</Text>}
   <Button variant="outline" loading={query.status==='loading'} disabled={!valid||query.status==='loading'} onClick={()=>void query.start()}>{t(query.status==='idle'?'routeInventory.find':'routeGroup.refresh')}</Button>
   {query.status!=='idle'&&<Text role="status" aria-live="polite">{t(query.status==='complete'?'routeInventory.finished':`routeGroup.states.${query.status}`)}</Text>}
   {last?.ownerHistoryReadiness && <div>
    <Text as="p" weight={600}>{t(`routeInventory.history.${last.ownerHistoryReadiness.state}`)}</Text>
    <Text as="p">{t('routeInventory.history.counts',{scanned:last.ownerHistoryReadiness.scanned,indexed:last.ownerHistoryReadiness.indexed,missing:last.ownerHistoryReadiness.missing})}</Text>
    <Text as="p" variant="caption" tone="secondary">{t('routeInventory.history.scope',{date:date(last.ownerHistoryReadiness.asOf),unknown:last.ownerHistoryReadiness.unknown})}</Text>
   </div>}
   {!!query.pages.length&&<><Text>{t('routeInventory.counts',{scanned,count:rows.length,pages:query.pages.length})}</Text><Text variant="caption">{t('routeInventory.snapshot',{date:date(last!.readTime.seconds*1000)})}</Text>
    {!rows.length&&<Text>{t(last?.inventory.nextCursor?'routeInventory.emptyMore':'routeInventory.empty')}</Text>}
    <ul>{rows.map(row=><li key={row.activityId}><LocalizedLink to={`/activity/${encodeURIComponent(row.activityId)}?tab=overview`} state={{routeInventoryReturn:{uid:activity.userId,pathname:location.pathname,search:location.search,hash:location.hash}}}><time dateTime={new Date(row.startTime).toISOString()}>{date(row.startTime)}</time><span>{t('routeInventory.openSource')}</span></LocalizedLink></li>)}</ul>
    {last?.inventory.nextCursor&&<Button variant="outline" disabled={query.status==='loading'} onClick={()=>void query.loadMore()}>{t('routeInventory.more')}</Button>}
    {last?.inventory.exhausted&&<Text>{t('routeInventory.exhausted')}</Text>}
   </>}
   <Text variant="caption" tone="secondary">{t('routeInventory.lifetime')}</Text>
  </div>
 </details></section>;
}
