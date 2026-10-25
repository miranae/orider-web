import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import type { Activity, ActivitySummary } from '@shared/types';
import type { ActivityDiscoveryItem, ActivityDiscoveryRequest, ActivityDiscoveryResponse } from '@shared/activity-discovery';
import type { FirebaseServices } from '../contexts/FirebaseServicesContext';
import { getRuntimeConfig, isEmulatorRuntime } from './runtimeConfig';
import { activityFeedSourceRevision } from './activityFeedContent';
export type { ActivityDiscoveryRequest } from '@shared/activity-discovery';
export type DiscoveryActivity = Activity & { discoveryFacts: ActivityDiscoveryItem['activity']['effectiveFacts']; activityRevision: string };
const finite = (value: unknown): number | null => typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
/** Public presentation only. Never reconstruct private load, thresholds, original IDs or streams. */
export function mapDiscoveryActivity(item: ActivityDiscoveryItem): DiscoveryActivity {
 const a=item.activity,m=a.effectiveFacts.metrics,s=a.summary;
 const metric=(canonical:string,recorded:string,scale=1)=>{const value=finite(m?m[canonical]:s[recorded]);return value===null?Number.NaN:value*scale;};
 const summary: ActivitySummary={distance:metric('distanceKm','distance',m?1000:1),ridingTimeMillis:metric('durationSec','ridingTimeMillis',m?1000:1),
  averageSpeed:metric('avgSpeedKph','averageSpeed'),maxSpeed:metric('maxSpeedKph','maxSpeed'),elevationGain:metric('elevationGainM','elevationGain'),
  averageCadence:null,maxCadence:null,averageHeartRate:null,maxHeartRate:null,averagePower:null,maxPower:null,normalizedPower:null,calories:null,relativeEffort:null,tss:null,swolf:null};
 if(m){const moving=finite(m.movingTimeSec),pause=finite(m.pauseTimeSec);if(moving!==null)summary.movingTimeSec=moving;if(pause!==null)summary.pauseTimeSec=pause;}
 else {const elapsed=finite(s.elapsedTimeMillis),moving=finite(s.movingTimeSec),pause=finite(s.pauseTimeSec);if(elapsed!==null)summary.elapsedTimeMillis=elapsed;if(moving!==null)summary.movingTimeSec=moving;if(pause!==null)summary.pauseTimeSec=pause;}
 const activity:DiscoveryActivity={id:a.id,userId:a.userId,nickname:a.nickname,profileImage:a.profileImage,type:a.type,createdAt:a.createdAt,startTime:a.startTime,endTime:a.endTime,
  description:a.description,visibility:a.visibility as Activity['visibility'],source:a.source==='orider'||a.source==='strava'?a.source:undefined,summary,
  thumbnailTrack:item.mapPreview.encodedPolyline??'',mapImageUrl:item.mapPreview.imageUrl,groupId:null,groupRideId:null,gpxPath:null,deletedAt:null,
  segmentEffortCount:0,photoCount:a.photoCount,kudosCount:a.kudosCount,commentCount:a.commentCount,activityRevision:item.presentationRevision,discoveryFacts:a.effectiveFacts};
 if(item.content.status==='ready')activity.feedContentV1={version:1,sourceRevision:activityFeedSourceRevision(activity),revision:item.presentationRevision,
  memo:item.content.memo,memoTruncated:item.content.memoTruncated,photos:item.content.photos,totalPhotoCount:item.content.totalPhotoCount,totalPhotoCountExact:item.content.totalPhotoCountExact};
 return item.generatedSummary ? {...activity, defaultSummaryV1: {version:1,state:"ready",sourceRevision:activityFeedSourceRevision(activity),formatterVersion:item.generatedSummary.formatterVersion,inputDigest:item.generatedSummary.inputDigest,text:item.generatedSummary.text}} : activity;
}
const connected=new WeakSet<object>();
export async function loadActivityDiscovery(services:FirebaseServices,request:ActivityDiscoveryRequest):Promise<Omit<ActivityDiscoveryResponse,'items'>&{items:DiscoveryActivity[]}>{
 const viewer=services.auth.currentUser;
 const assertCurrent=()=>{if(services.auth.currentUser!==viewer)throw Error('account_changed');};
 assertCurrent();await services.ensureAppCheckReady();assertCurrent();
 const functions=getRuntimeConfig().appEnvironment==='stage'?services.functions:getFunctions(services.functions.app,'asia-northeast3');
 if(isEmulatorRuntime()&&!connected.has(functions)){connectFunctionsEmulator(functions,'localhost',Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT||5001));connected.add(functions);}
 const {data}=await httpsCallable<ActivityDiscoveryRequest,ActivityDiscoveryResponse>(functions,'getActivityDiscovery',{timeout:10000})(request);assertCurrent();
 if(!data||!Array.isArray(data.items)||data.items.length>Math.min(request.limit??20,20)||!Number.isFinite(data.expiresAt)||data.expiresAt<=Date.now()||data.totalCount!==null||data.consistency!=='current_authorized_seek_pages'||!Number.isInteger(data.scannedCount)||data.scannedCount<0||data.scannedCount>50||typeof data.exhausted!=='boolean'||data.exhausted!==(data.nextCursor===null)||data.nextCursor!==null&&(typeof data.nextCursor!=='string'||!data.nextCursor.startsWith('ad1.'))||data.order!==(request.order??'startTime_desc')||data.includesUndated!==(data.order==='id_asc'&&request.fromInclusive===undefined&&request.toExclusive===undefined))throw Error('invalid_activity_discovery');
 const ids=new Set<string>();
 for(const item of data.items){const a=item?.activity;if(request.anchorActivityId&&item.anchorBoundCoRider!==true)throw Error('invalid_activity_discovery');if(!a||typeof a.id!=='string'||!a.id||ids.has(a.id)||typeof a.userId!=='string'||!a.userId||a.externalId!==null||!a.effectiveFacts||a.effectiveFacts.thresholdBasis!==null||!item.mapPreview||!item.content||!['ready','pending'].includes(item.content.status)||typeof item.presentationRevision!=='string'||!/^[a-f0-9]{64}$/.test(item.presentationRevision))throw Error('invalid_activity_discovery');if(item.generatedSummary&&(!/^[a-f0-9]{64}$/.test(item.generatedSummary.inputDigest)||!/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(item.generatedSummary.formatterVersion)||!['ko','en'].every(lang=>{const text=item.generatedSummary!.text?.[lang as 'ko'|'en'];return typeof text==='string'&&text.trim().length>0&&text.length<=3500;})))throw Error('invalid_activity_discovery');ids.add(a.id);}
 return {...data,items:data.items.map(mapDiscoveryActivity)};
}
