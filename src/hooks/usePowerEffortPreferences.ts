import { useEffect, useRef, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import type { StagePowerEffortPreferenceRequest } from "@shared/types/stage-power-effort-preference";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { stageActivityPowerAvailable } from "../services/stageActivityPowerDuration";
import { callPowerEffort, newPowerEffortKey, type PowerEffortRead, type PowerEffortResponse, type PowerEffortMutationResponse } from "../services/stagePowerEffortPreferences";

export interface PowerEffortHandle { activityId: string; activityIncarnationBinding: string }
interface State { generation:number; response:PowerEffortResponse|null; pending:StagePowerEffortPreferenceRequest|null; outcome:PowerEffortMutationResponse["outcome"]|null; failure:boolean; busy:boolean; cancelledUnknown:boolean }
/** 조회·저장·복원은 명시 동작만 실행하며 token 갱신/계정 ABA는 결과와 늦은 callback을 폐기한다. */
export function usePowerEffortPreferences(ownerUid:string, request:PowerEffortRead|null, scopeKey="") {
  const {user}=useAuth(),services=useFirebaseServices();
  const native=services.auth.currentUser;
  const [epoch,setEpoch]=useState(0),[state,setState]=useState<State|null>(null),[saved,setSaved]=useState<{identity:string;handles:PowerEffortHandle[]} | null>(null);
  const available=!!native&&!native.isAnonymous&&native.tenantId===null&&native.uid===ownerUid&&user?.uid===ownerUid&&!user.isAnonymous&&stageActivityPowerAvailable();
  const identity=JSON.stringify([available?ownerUid:null,native?.metadata?.creationTime,epoch,request,scopeKey]);
  const ref=useRef({identity,services,native,generation:0,busy:false,mounted:true});
  if(ref.current.identity!==identity||ref.current.services!==services||ref.current.native!==native)ref.current={identity,services,native,generation:ref.current.generation+1,busy:false,mounted:ref.current.mounted};
  useEffect(()=>available?onIdTokenChanged(services.auth,()=>{ref.current.generation++;ref.current.busy=false;setSaved(null);setEpoch(v=>v+1);}):undefined,[services,available]);
  useEffect(()=>{ref.current.mounted=true;return()=>{ref.current.mounted=false;ref.current.generation++;ref.current.busy=false;};},[]);
  const generation=ref.current.generation,current=state?.generation===generation?state:null;
  const handles=saved?.identity===identity?saved.handles:[];
  const setHandles=(handles:PowerEffortHandle[])=>setSaved({identity,handles});
  const activeFor=(target:number)=>ref.current.mounted&&ref.current.generation===target&&ref.current.services===services&&services.auth.currentUser===native&&available;
  const active=()=>activeFor(generation);
  // 힌트만 보관한다. raw UID/token/authority는 저장하지 않으며 SDK 생성시각이 없으면 보관하지 않는다.
  const storageKey=async(check=active)=>{
    if(!check()||!native?.metadata?.creationTime||!crypto.subtle)return null;
    const bytes=new TextEncoder().encode(JSON.stringify([services.auth.app.options.projectId,services.auth.app.name,ownerUid,native.metadata.creationTime]));
    let digest:ArrayBuffer;
    try{digest=await crypto.subtle.digest("SHA-256",bytes);}catch{return null;}
    return check()?`orider-power-effort-hints-${Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("")}`:null;
  };
  const remember=async(response:PowerEffortResponse,check=active)=>{
    const sources="sources" in response?response.sources:[response];
    const next=sources.filter(s=>s.activityIncarnationBinding&&s.points.some(p=>p.excluded)).map(s=>({activityId:s.activityId,activityIncarnationBinding:s.activityIncarnationBinding!}));
    const key=await storageKey(check);if(!check())return;
    try {
      const old:PowerEffortHandle[]=key?JSON.parse(sessionStorage.getItem(key)??"[]"):[];
      const valid=Array.isArray(old)?old.filter(h=>h&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u.test(h.activityId)&&/^[a-f0-9]{64}$/u.test(h.activityIncarnationBinding)):[];
      const merged=[...new Map([...valid.filter(h=>!sources.some(s=>s.activityId===h.activityId&&s.activityIncarnationBinding===h.activityIncarnationBinding)),...next].map(h=>[JSON.stringify(h),h])).values()].slice(-40);
      setHandles(merged);if(key)sessionStorage.setItem(key,JSON.stringify(merged));
    }catch{setHandles(next);}
  };
  const run=async(input:PowerEffortRead|StagePowerEffortPreferenceRequest)=>{
    if(!active()||ref.current.busy)return;
    const operationGeneration=++ref.current.generation,check=()=>activeFor(operationGeneration);
    const mutation="idempotencyKey" in input;
    const pending=mutation?structuredClone(input):null;
    ref.current.busy=true;
    setState({generation:operationGeneration,response:null,pending,outcome:null,failure:false,busy:true,cancelledUnknown:false});
    try{
      if(mutation){
        const key=await storageKey(check);if(!check())return;
        if(key)try{const value=JSON.parse(sessionStorage.getItem(key)??"[]");const old:PowerEffortHandle[]=Array.isArray(value)?value:[];const h={activityId:input.activityId,activityIncarnationBinding:input.expectedActivityIncarnation};sessionStorage.setItem(key,JSON.stringify([...new Map([...old,h].map(h=>[JSON.stringify(h),h])).values()].slice(-40)));}catch{/* 저장소 접근 실패는 서버 결과를 바꾸지 않는다. */}
      }
      const response=await callPowerEffort(services,ownerUid,input,check);if(!check())return;
      if(mutation){const result=response as PowerEffortMutationResponse;setState({generation:operationGeneration,response:null,pending:result.outcome==="commit_outcome_unknown"?pending:null,outcome:result.outcome,failure:false,busy:false,cancelledUnknown:false});
      }else{setState({generation:operationGeneration,response:response as PowerEffortResponse,pending:null,outcome:null,failure:false,busy:false,cancelledUnknown:false});await remember(response as PowerEffortResponse,check);}
    }catch{if(check())setState({generation:operationGeneration,response:null,pending,outcome:mutation?"commit_outcome_unknown":null,failure:true,busy:false,cancelledUnknown:false});}
    finally{if(check())ref.current.busy=false;}
  };
  const reloadHandles=async()=>{if(!active()||ref.current.busy)return;const key=await storageKey();if(!active())return;try{const value=key?JSON.parse(sessionStorage.getItem(key)??"[]"):[];setHandles(Array.isArray(value)?value.filter(h=>h&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u.test(h.activityId)&&/^[a-f0-9]{64}$/u.test(h.activityIncarnationBinding)).slice(-40):[]);}catch{setHandles([]);}};
  return {available,busy:current?.busy??false,response:current?.response??null,pending:current?.pending??null,outcome:current?.outcome??null,failure:current?.failure??false,cancelledUnknown:current?.cancelledUnknown??false,handles,
    refresh:()=>{if(!current?.pending&&request) return run(request);},
    change:(ready:Omit<StagePowerEffortPreferenceRequest,"idempotencyKey">)=>{
      if(!active()||current?.pending||!current?.response)return;
      const sources="sources" in current.response?current.response.sources:[current.response];
      const issued=sources.some(s=>s.points.some(p=>[p.excludeReady,p.restoreReady].some(r=>r&&JSON.stringify(r)===JSON.stringify(ready))));
      if(issued)return run({...structuredClone(ready),idempotencyKey:newPowerEffortKey()});
    },retry:()=>{if(current?.pending)return run(current.pending);},reloadHandles,
    inspectHandle:(handle:PowerEffortHandle)=>{if(!current?.pending&&handles.some(h=>JSON.stringify(h)===JSON.stringify(handle)))return run({version:1,mode:"stage_power_effort_orphan_inspect",...handle});},
    cancel:()=>{if(!active())return;const unknown=!!current?.pending;ref.current.generation++;ref.current.busy=false;setState({generation:ref.current.generation,response:null,pending:null,outcome:null,failure:false,busy:false,cancelledUnknown:unknown});},
  };
}
