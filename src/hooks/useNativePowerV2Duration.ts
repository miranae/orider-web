import { useCallback, useEffect, useRef, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import type { Activity } from "@shared/types";
import type { NativePowerV2ReaderResponse } from "@shared/types/stage-native-power-v2-publication";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { getDiscipline } from "../utils/disciplineFilter";
import { stageActivityPowerAvailable } from "../services/stageActivityPowerDuration";
import { loadNativePowerV2Duration, nativePowerV2DurationSeconds } from "../services/nativePowerV2Duration";
interface State {generation:number;metadata:NativePowerV2ReaderResponse|null;result:NativePowerV2ReaderResponse|null;confirmedAt:number|null;expiresAt:number|null;busy:boolean;failure:boolean}
export function useNativePowerV2Duration(activity:Activity,draft:string,scopeKey="") {
 const {user}=useAuth(),services=useFirebaseServices(),nativeUser=services.auth.currentUser;
 const authInstance=services.auth,functionsInstance=services.functions,authRealm=services.auth.app,functionRealm=services.functions.app,functionsBase=services.functions.customDomain;
 const mounted=useRef(false);
 const [authEpoch,setAuthEpoch]=useState(0),[state,setState]=useState<State|null>(null);
 const duration=nativePowerV2DurationSeconds(draft);
 const owner=!!user&&!user.isAnonymous&&user.uid===activity.userId&&activity.deletedAt==null&&getDiscipline(activity.type)==="bike"&&/^orider_[A-Za-z0-9_-]{0,153}$/u.test(activity.id);
 const available=owner&&!!nativeUser&&!nativeUser.isAnonymous&&nativeUser.uid===activity.userId&&stageActivityPowerAvailable()&&services.functions.app===services.auth.app&&services.functions.customDomain==="https://asia-northeast3-orider-dev.cloudfunctions.net";
 const head=activity as Activity&Record<string,unknown>;
 const identity=JSON.stringify([available?activity.userId:null,authEpoch,activity.id,activity.startTime,activity.endTime,activity.deletedAt,activity.contentRevision,activity.contentSelectedRevision,activity.sourceMeta,activity.visibility,activity.isVirtualPower,head.hidePower,head.metadataRevision,head.updatedAt,scopeKey,draft]);
 const ref=useRef({identity,services,nativeUser,authInstance,functionsInstance,authRealm,functionRealm,functionsBase,generation:0,busy:false});
 if(ref.current.identity!==identity||ref.current.services!==services||ref.current.nativeUser!==nativeUser||ref.current.authInstance!==authInstance||ref.current.functionsInstance!==functionsInstance||ref.current.authRealm!==authRealm||ref.current.functionRealm!==functionRealm||ref.current.functionsBase!==functionsBase)ref.current={identity,services,nativeUser,authInstance,functionsInstance,authRealm,functionRealm,functionsBase,generation:ref.current.generation+1,busy:false};
 const invalidate=useCallback(()=>{ref.current.generation++;ref.current.busy=false;setState(null);},[]);
 // 로컬 Auth 보안 fence만 추가한다. 활동/Firestore 구독과 조회는 추가하지 않는다.
 useEffect(()=>onIdTokenChanged(services.auth,()=>{ref.current.generation++;ref.current.busy=false;setState(null);setAuthEpoch(v=>v+1);}),[services]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;ref.current.generation++;ref.current.busy=false;};},[]);
 // 30분은 로컬 보관 상한이다. 실제 서버 TTL을 뜻하지 않으며 opaque session은 해석하지 않는다.
 const now=Date.now();
 const current=state?.generation===ref.current.generation&&(!state.expiresAt||state.confirmedAt!==null&&now>=state.confirmedAt&&now<state.expiresAt)?state:null;
 useEffect(()=>{
  if(!state?.expiresAt||state.generation!==ref.current.generation)return;
  const remaining=state.expiresAt-Date.now();if(remaining<=0){invalidate();return;}
  const timer=setTimeout(()=>{if(ref.current.generation===state.generation)invalidate();},remaining);
  return()=>clearTimeout(timer);
 },[state,invalidate]);
 const renderGeneration=ref.current.generation;
 const scopeActive=()=>mounted.current&&ref.current.generation===renderGeneration&&ref.current.identity===identity&&ref.current.services===services&&ref.current.nativeUser===nativeUser&&services.auth===authInstance&&services.functions===functionsInstance&&services.auth.app===authRealm&&services.functions.app===functionRealm&&services.functions.customDomain===functionsBase&&services.auth.currentUser===nativeUser&&!!nativeUser&&!nativeUser.isAnonymous&&nativeUser.uid===activity.userId&&available&&stageActivityPowerAvailable();
 const cancel=()=>{if(scopeActive())invalidate();};
 const canCalculate=available&&duration!==null&&!current?.busy&&current?.metadata?.state==="available"&&!!current.metadata.session;
 const run=async(compute:boolean)=>{
  if(!scopeActive()||duration===null||ref.current.busy||compute&&!canCalculate)return;
  if(compute&&(!current?.expiresAt||current.confirmedAt===null||Date.now()<current.confirmedAt||Date.now()>=current.expiresAt)){invalidate();return;}
  const generation=renderGeneration,startedAt=Date.now();
  const active=scopeActive;
  ref.current.busy=true;setState({generation,metadata:compute?current?.metadata??null:null,result:null,confirmedAt:compute?current?.confirmedAt??null:null,expiresAt:compute?current?.expiresAt??null:null,busy:true,failure:false});
  try {
   const response=await loadNativePowerV2Duration(services,activity.userId,compute?{mode:"stage_native_power_v2_duration",activityId:activity.id,durationSeconds:duration,periodBinding:null,session:current!.metadata!.session!}:{mode:"stage_native_power_v2_metadata",activityId:activity.id,durationSeconds:duration,periodBinding:null},active);
   const receivedAt=Date.now();if(!active())return;
   if(receivedAt<startedAt||compute&&(!current?.expiresAt||receivedAt>=current.expiresAt))throw Error("expired_native_power_v2_session");
   const reusable=response.state==="available"||response.state==="no_continuous_window";
   setState({generation,metadata:compute?reusable?current!.metadata:null:response,result:compute?response:null,confirmedAt:reusable?compute?current!.confirmedAt:startedAt:null,expiresAt:reusable?compute?current!.expiresAt:startedAt+1800000:null,busy:false,failure:false});
  }catch{if(active())setState({generation,metadata:null,result:null,confirmedAt:null,expiresAt:null,busy:false,failure:true});}
  finally{if(active())ref.current.busy=false;}
 };
 return {available,duration,metadata:current?.metadata??null,result:current?.result??null,busy:current?.busy??false,failure:current?.failure??false,canCalculate,cancel,confirm:()=>run(false),calculate:()=>run(true)};
}
