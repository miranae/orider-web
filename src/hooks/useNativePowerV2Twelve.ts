import { useEffect, useRef, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import type { NativePowerTwelveCandidate, NativePowerTwelvePeriod, NativePowerTwelveResponse } from "@shared/types/stage-native-power-v2-twelve";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadNativePowerTwelve } from "../services/nativePowerV2Twelve";
import { stageActivityPowerAvailable } from "../services/stageActivityPowerDuration";
import type { NativePowerLoadedActivity } from "../features/fitness/components/NativePowerTwelvePersonalView";
export function useNativePowerV2Twelve(ownerUid: string, activities: readonly NativePowerLoadedActivity[], selectedIds: readonly string[], periods: readonly NativePowerTwelvePeriod[], enabled: boolean) {
 const {user}=useAuth(), services=useFirebaseServices();
 const [authEpoch,setAuthEpoch]=useState(0);
 // 로컬 Auth 보안 fence: Source/Firestore/활동 열거 구독이나 쿼리를 추가하지 않는다.
 useEffect(()=>onIdTokenChanged(services.auth,()=>{ref.current.generation++;ref.current.busy=false;setAuthEpoch(v=>v+1);}),[services]);
 const nativeUser=services.auth.currentUser;
 const available=!!nativeUser&&nativeUser.uid===ownerUid&&!nativeUser.isAnonymous&&enabled&&stageActivityPowerAvailable()&&user?.uid===ownerUid&&!user.isAnonymous;
 const identity=JSON.stringify([available?ownerUid:null,authEpoch,activities.map(a=>[a.activityId,a.headBinding]),selectedIds,periods]);
 const ref=useRef({identity,services,nativeUser,generation:0,busy:false});
 if(ref.current.identity!==identity||ref.current.services!==services||ref.current.nativeUser!==nativeUser)ref.current={identity,services,nativeUser,generation:ref.current.generation+1,busy:false};
 useEffect(()=>()=>{ref.current.generation++;ref.current.busy=false;},[]);
 const [state,setState]=useState<{generation:number;candidates:NativePowerTwelveCandidate[];response:NativePowerTwelveResponse|null;busy:boolean;failure:boolean}|null>(null);
 const current=state?.generation===ref.current.generation?state:null;
 const run=async (id?:string)=>{
  if(!available||ref.current.busy)return;
  if(id&&(!selectedIds.includes(id)||selectedIds.length>2||!activities.some(a=>a.activityId===id)))return;
  const candidates=current?.candidates??[];
  const selected=selectedIds.map(value=>candidates.find(c=>c.activityId===value));
  if(!id&&(selected.length<1||selected.length>2||selected.some(c=>!c)||periods.length<1||periods.length>2))return;
  const generation=ref.current.generation, active=()=>ref.current.generation===generation&&services.auth.currentUser===nativeUser&&nativeUser?.uid===ownerUid&&!nativeUser.isAnonymous&&stageActivityPowerAvailable();
  const old={generation,candidates,response:current?.response??null,busy:true,failure:false};
  ref.current.busy=true;setState(old);
  try {
   const response=await loadNativePowerTwelve(services,ownerUid,id?{version:1,mode:"stage_native_power_v2_twelve_inspect",activityId:id}:{version:1,mode:"stage_native_power_v2_twelve_personal_periods",periods:periods.map(p=>({...p})),selectedSources:(selected as NativePowerTwelveCandidate[]).map(({activityId,activityRevision,baseMetricsRevision,sourceBinding})=>({activityId,activityRevision,baseMetricsRevision,sourceBinding}))},active);
   if(active())setState({generation,candidates:id?[...candidates.filter(c=>c.activityId!==id),response.sources[0]!.candidate]:candidates,response:id?null:response,busy:false,failure:false});
  } catch { if(active())setState({generation,candidates:[],response:null,busy:false,failure:true}); }
  finally{if(active())ref.current.busy=false;}
 };
 return {available,busy:current?.busy??false,failure:current?.failure??false,response:current?.response??null,inspectedIds:current?.candidates.map(c=>c.activityId)??[],inspect:(id:string)=>run(id),load:()=>run()};
}
