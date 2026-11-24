import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import type { Activity, ActivitySummary } from '@shared/types';
import type { ActivityDiscoveryItem, ActivityDiscoveryRequest, ActivityDiscoveryResponse } from '@shared/activity-discovery';
import type { FirebaseServices } from '../contexts/FirebaseServicesContext';
import { callApprovedActivityRead, reportApprovedActivityReadFailure } from '../embedded/callApprovedActivityRead';
import { isFunctionsGatewayRuntime, getRuntimeConfig, isEmulatorRuntime } from './runtimeConfig';
import { activityFeedSourceRevision } from './activityFeedContent';
import { logClientError } from './errorLogger';
/**
 * 공개 활동의 기준값은 서버가 활동 공개 범위 정책(P1)에 따라 내보낸다. null 또는 숫자 값 객체만 받는다.
 * 예전에는 null 만 허용해 기준값이 실린 페이지 전체를 거부했고, 홈 활동 목록이 "활동을 불러오지 못했어요"로
 * 막혔다(2026-11-24). 화면은 이 값을 쓰지 않으므로 형태만 확인한다.
 */
function isThresholdBasis(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(v => typeof v === 'number' && Number.isFinite(v));
}
export type { ActivityDiscoveryRequest } from '@shared/activity-discovery';
export type DiscoveryActivity = Activity & { discoveryFacts: ActivityDiscoveryItem['activity']['effectiveFacts']; activityRevision: string };
const finite = (value: unknown): number | null => typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
/**
 * 서버가 보낸 활동 단위 값만 그린다 — 원본 ID·스트림은 재구성하지 않는다.
 * 심박·파워·케이던스·칼로리·부하도 활동을 볼 수 있는 누구에게나 보인다(P1). 서버가 안 보낸 값(옛 좁은 응답)은 null 로 둔다.
 */
export function mapDiscoveryActivity(item: ActivityDiscoveryItem): DiscoveryActivity {
 const a=item.activity,m=a.effectiveFacts.metrics,s=a.summary;
 const metric=(canonical:string,recorded:string,scale=1)=>{const value=finite(m?m[canonical]:s[recorded]);return value===null?Number.NaN:value*scale;};
 const optional=(canonical:string,recorded:string)=>finite(m?m[canonical]:s[recorded]);
 const summary: ActivitySummary={distance:metric('distanceKm','distance',m?1000:1),ridingTimeMillis:metric('durationSec','ridingTimeMillis',m?1000:1),
  averageSpeed:metric('avgSpeedKph','averageSpeed'),maxSpeed:metric('maxSpeedKph','maxSpeed'),elevationGain:metric('elevationGainM','elevationGain'),
  averageCadence:optional('avgCadence','averageCadence'),maxCadence:optional('maxCadence','maxCadence'),
  averageHeartRate:optional('avgHr','averageHeartRate'),maxHeartRate:optional('maxHr','maxHeartRate'),
  averagePower:optional('avgPower','averagePower'),maxPower:optional('maxPower','maxPower'),normalizedPower:optional('np','normalizedPower'),
  calories:optional('caloriesKcal','calories'),relativeEffort:optional('trimp','relativeEffort'),tss:optional('tss','tss'),swolf:null};
 if(m){const moving=finite(m.movingTimeSec),pause=finite(m.pauseTimeSec);if(moving!==null)summary.movingTimeSec=moving;if(pause!==null)summary.pauseTimeSec=pause;}
 else {const elapsed=finite(s.elapsedTimeMillis),moving=finite(s.movingTimeSec),pause=finite(s.pauseTimeSec);if(elapsed!==null)summary.elapsedTimeMillis=elapsed;if(moving!==null)summary.movingTimeSec=moving;if(pause!==null)summary.pauseTimeSec=pause;}
 const activity:DiscoveryActivity={id:a.id,userId:a.userId,nickname:a.nickname,profileImage:a.profileImage,type:a.type,createdAt:a.createdAt,startTime:a.startTime,endTime:a.endTime,
  description:a.description,visibility:a.visibility as Activity['visibility'],source:a.source==='orider'||a.source==='strava'?a.source:undefined,summary,
  thumbnailTrack:item.mapPreview.encodedPolyline??'',mapImageUrl:item.mapPreview.imageUrl,groupId:null,groupRideId:null,gpxPath:null,deletedAt:null,
  viewerHasKudos:item.viewerHasKudos,segmentEffortCount:0,photoCount:a.photoCount,kudosCount:a.kudosCount,commentCount:a.commentCount,activityRevision:item.presentationRevision,discoveryFacts:a.effectiveFacts};
 if(item.content.status==='ready')activity.feedContentV1={version:1,sourceRevision:activityFeedSourceRevision(activity),revision:item.presentationRevision,
  memo:item.content.memo,memoTruncated:item.content.memoTruncated,photos:item.content.photos,totalPhotoCount:item.content.totalPhotoCount,totalPhotoCountExact:item.content.totalPhotoCountExact};
 return item.generatedSummary ? {...activity, defaultSummaryV1: {version:1,state:"ready",sourceRevision:activityFeedSourceRevision(activity),formatterVersion:item.generatedSummary.formatterVersion,inputDigest:item.generatedSummary.inputDigest,text:item.generatedSummary.text}} : activity;
}
const connected=new WeakSet<object>();
type DiscoveryPage = Omit<ActivityDiscoveryResponse,'items'>&{items:DiscoveryActivity[]};
export async function loadActivityDiscovery(
 services: FirebaseServices, request: ActivityDiscoveryRequest, signal?: AbortSignal, onLateFailure?: (error: unknown) => void,
): Promise<DiscoveryPage> {
 const controller = new AbortController();
 const viewer = services.auth.currentUser;
 const signedInAt = viewer?.metadata?.lastSignInTime;
 let active=true, rejectAbort: (error: Error)=>void = () => {};
 const stop = (message: string, reason?: DOMException) => { active=false; rejectAbort(Error(message)); controller.abort(reason); };
 const abort = () => stop('request_aborted');
 const aborted = new Promise<never>((_,reject)=>{rejectAbort=reject;});
 const timer=setTimeout(()=>stop('request_timeout',new DOMException('request_timeout','TimeoutError')),15000);
 signal?.addEventListener('abort',abort,{once:true});
 if(signal?.aborted)abort();
 const read = readActivityDiscovery(services,request,()=>{if(!active||signal?.aborted)throw Error('request_aborted');},controller.signal)
  .catch(error => {
   const cancelled = error === controller.signal.reason || error?.name === 'AbortError'
    || error?.message === 'request_aborted' || error?.message === 'account_changed';
   if (services.scope !== 'embedded' && controller.signal.aborted && !cancelled) {
    if (onLateFailure) onLateFailure(error);
    else logClientError('activityDiscovery.lateFailure', error, { scope: request.scope, continuation: Boolean(request.cursor) },
     services, viewer, '', () => services.auth.currentUser === viewer && viewer?.metadata?.lastSignInTime === signedInAt);
   }
   throw error;
  });
 try { return await Promise.race([read,aborted]); }
 finally {active=false;clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
async function readActivityDiscovery(services:FirebaseServices,request:ActivityDiscoveryRequest,assertActive:()=>void,signal:AbortSignal):Promise<DiscoveryPage>{
 const viewer=services.auth.currentUser;
 const app=services.auth.app;
 const signedInAt=viewer?.metadata?.lastSignInTime;
 const embedded=services.scope==='embedded';
 const assertCurrent=()=>{
  assertActive();
  const approval=services.isSessionApproved?.(viewer);
  if(services.auth.app!==app||services.auth.currentUser!==viewer||viewer?.metadata?.lastSignInTime!==signedInAt
   ||(embedded?approval!==true:approval===false))throw Error('account_changed');
 };
 assertCurrent();
 if(!embedded){await services.ensureAppCheckReady();assertCurrent();}
 const data=embedded
  ? await callApprovedActivityRead<ActivityDiscoveryResponse>(services,viewer,'getActivityDiscovery','asia-northeast3',request,assertCurrent,signal)
  : await fetchSdkDiscovery(services,request);
 assertCurrent();
 try {
  return validateDiscoveryPage(data,request);
 } catch (error) {
  if (embedded) reportApprovedActivityReadFailure(services,viewer,'getActivityDiscovery','contract');
  throw error;
 }
}

function validateDiscoveryPage(data: ActivityDiscoveryResponse, request: ActivityDiscoveryRequest): DiscoveryPage {
 if(!data||!Array.isArray(data.items)||data.items.length>Math.min(request.limit??20,20)||!Number.isFinite(data.expiresAt)||data.expiresAt<=Date.now()||data.totalCount!==null||data.consistency!=='current_authorized_seek_pages'||!Number.isInteger(data.scannedCount)||data.scannedCount<0||data.scannedCount>50||typeof data.exhausted!=='boolean'||data.exhausted!==(data.nextCursor===null)||data.nextCursor!==null&&(typeof data.nextCursor!=='string'||!data.nextCursor.startsWith('ad1.'))||data.order!==(request.order??'startTime_desc')||data.includesUndated!==(data.order==='id_asc'&&request.fromInclusive===undefined&&request.toExclusive===undefined))throw Error('invalid_activity_discovery');
 const ids=new Set<string>();
 for(const item of data.items){const a=item?.activity;if(request.anchorActivityId&&item.anchorBoundCoRider!==true)throw Error('invalid_activity_discovery');if(item.viewerHasKudos!==undefined&&typeof item.viewerHasKudos!=='boolean')throw Error('invalid_activity_discovery');if(!a||typeof a.id!=='string'||!a.id||ids.has(a.id)||typeof a.userId!=='string'||!a.userId||a.externalId!==null||!a.effectiveFacts||!isThresholdBasis(a.effectiveFacts.thresholdBasis)||!item.mapPreview||!item.content||!['ready','pending'].includes(item.content.status)||typeof item.presentationRevision!=='string'||!/^[a-f0-9]{64}$/.test(item.presentationRevision))throw Error('invalid_activity_discovery');if(item.generatedSummary&&(!/^[a-f0-9]{64}$/.test(item.generatedSummary.inputDigest)||!/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(item.generatedSummary.formatterVersion)||!['ko','en'].every(lang=>{const text=item.generatedSummary!.text?.[lang as 'ko'|'en'];return typeof text==='string'&&text.trim().length>0&&text.length<=3500;})))throw Error('invalid_activity_discovery');ids.add(a.id);}
 return {...data,items:data.items.map(mapDiscoveryActivity)};
}

async function fetchSdkDiscovery(services: FirebaseServices, request: ActivityDiscoveryRequest): Promise<ActivityDiscoveryResponse> {
 const functions=isFunctionsGatewayRuntime(getRuntimeConfig())?services.functions:getFunctions(services.functions.app,'asia-northeast3');
 if(isEmulatorRuntime()&&!connected.has(functions)){connectFunctionsEmulator(functions,'localhost',Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT||5001));connected.add(functions);}
 return (await httpsCallable<ActivityDiscoveryRequest,ActivityDiscoveryResponse>(functions,'getActivityDiscovery',{timeout:10000})(request)).data;
}
