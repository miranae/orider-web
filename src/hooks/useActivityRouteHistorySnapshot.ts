import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { RouteHistorySnapshotResponse, RouteHistorySavedResponse } from "@shared/activity-route-history-snapshot";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { observedRouteAvailable } from "../services/activityRouteEvidence";
import { loadRouteHistorySnapshot, loadRouteHistorySaved } from "../services/activityRouteHistorySnapshot";
export const ROUTE_HISTORY_MAX_REQUESTS = 2000;
import { useRouteHistoryCheckpoint } from "./useRouteHistoryCheckpoint";
const denied=(error:unknown)=>{const e=error as{code?:string;message?:string};return /permission-denied|unauthenticated|not-found|failed-precondition/.test(e?.code??"")||["account_changed","invalid_route_history_response"].includes(e?.message??"");};
const isHidden=()=>document.visibilityState==="hidden";
const isSaved=(value:RouteHistorySnapshotResponse|null|undefined)=>value?.state==="complete"&&value.retention==="saved_result";
type Status = "idle" | "loading" | "error" | "expired" | "invalidated" | "stopped" | "ready" | "hidden";
export function useActivityRouteHistorySnapshot(uid: string, activityId: string, discipline: "bike" | "run" | null, head: string) {
 const services=useFirebaseServices(),{user}=useAuth(),auth=services.auth,app=auth.app,functions=services.functions,sdkUser=auth.currentUser;
 const available=observedRouteAvailable()&&!!discipline&&!!user&&!user.isAnonymous&&user.uid===uid&&!!sdkUser&&!sdkUser.isAnonymous&&sdkUser.uid===uid;
 const scope=JSON.stringify([uid,activityId,discipline,available]);
 const checkpoint=useRouteHistoryCheckpoint(services,uid,JSON.stringify([scope,head])),checkpointRef=useRef(checkpoint);checkpointRef.current=checkpoint;
 const checkingAccess=useRef(false);
 const identity=useRef({scope,services,auth,app,functions,sdkUser}),generation=useRef(0),busy=useRef(false);
 if(identity.current.scope!==scope||identity.current.services!==services||identity.current.auth!==auth||identity.current.app!==app||identity.current.functions!==functions||identity.current.sdkUser!==sdkUser){identity.current={scope,services,auth,app,functions,sdkUser};generation.current++;checkingAccess.current=false;}
 const requestHead=useRef(head);if(requestHead.current!==head){requestHead.current=head;generation.current++;}
 const [running,setRunning]=useState(false);
 const [stored,setStored]=useState<{generation:number;status:Status;data:RouteHistorySnapshotResponse|null}>({generation:0,status:"idle",data:null});
 const saved=useRef<{owner:typeof identity.current;entries:RouteHistorySnapshotResponse[];selected:string}|null>(null);
 if(saved.current?.owner!==identity.current)saved.current=null;
 const [history,setHistory]=useState<{owner:typeof identity.current;page:RouteHistorySavedResponse}|null>(null);
 const remember=useCallback((value:RouteHistorySnapshotResponse)=>{
  if(!isSaved(value))return;
  const entries=saved.current?.entries??[];
  saved.current={owner:identity.current,entries:[...entries.filter(old=>old.runId!==value.runId),value],selected:value.runId};
 },[]);
 const currentData=stored.generation===generation.current?stored.data:null;
 const status=stored.generation===generation.current?stored.status:"idle";
 const clear=useCallback((next:Status)=>{generation.current++;checkingAccess.current=false;checkpointRef.current.write(null);saved.current=null;setHistory(null);setStored({generation:generation.current,status:next,data:null});},[]);
 useEffect(()=>{let before=auth.currentUser;return onAuthStateChanged(auth,next=>{if(next!==before){const hadUser=!!before;before=next;if(hadUser)clear("invalidated");else{generation.current++;setStored({generation:generation.current,status:"idle",data:null});}}});},[auth,clear]);
 const retire=useCallback((next?:Status)=>{generation.current++;checkingAccess.current=false;checkpointRef.current.write(null);const value=saved.current?.entries.find(entry=>entry.runId===saved.current?.selected)??null;setStored({generation:generation.current,status:next??(value?"ready":"idle"),data:value});},[]);
 const beforeHead=useRef(head);
 useEffect(()=>{if(beforeHead.current!==head){beforeHead.current=head;retire();}},[head,retire]);
 useEffect(()=>{const changed=()=>retire();window.addEventListener("orider:activity-content-changed",changed);return()=>window.removeEventListener("orider:activity-content-changed",changed);},[retire]);
 useEffect(()=>()=>{generation.current++;},[]);
 useEffect(()=>{if(!currentData||isSaved(currentData))return;const delay=currentData.expiresAt-Date.now();if(delay<=0){if(saved.current)retire("expired");else clear("expired");return;}const timer=setTimeout(()=>{if(saved.current)retire("expired");else clear("expired");},delay);return()=>clearTimeout(timer);},[currentData,clear,retire]);
 const run=useCallback(async(restart:boolean,checkOnly=false)=>{
  if(!available||!discipline||busy.current||auth.currentUser!==sdkUser||auth.app!==app)return;
  let latest=restart?null:currentData??saved.current?.entries.find(entry=>entry.runId===saved.current?.selected)??null;
  const recovery=!restart&&!latest?checkpointRef.current.value:null;
  if(!restart&&(!latest&&!recovery||latest&&!checkOnly&&latest.state==="complete"&&status!=="error"))return;
  if(!restart&&!isSaved(latest)&&Date.now()>=(latest?.expiresAt??recovery?.expiresAt??0)){if(saved.current)retire("expired");else clear("expired");return;}
  if(restart){generation.current++;checkpointRef.current.write(null);}
  const token=generation.current,identityAtStart=identity.current;
  const current=()=>generation.current===token&&identity.current===identityAtStart&&services.auth===auth&&services.functions===functions&&auth.app===app&&auth.currentUser===sdkUser;
  if(checkOnly)checkingAccess.current=true;
  busy.current=true;setRunning(true);setStored({generation:token,status:"loading",data:latest});
  try{
   for(let step=0;step<(checkOnly?1:ROUTE_HISTORY_MAX_REQUESTS);step++){
    if(!current())return;
    if(latest&&!isSaved(latest)&&Date.now()>=latest.expiresAt){if(saved.current)retire("expired");else clear("expired");return;}
    const action=recovery&&!latest?"status":latest?(step===0&&(checkOnly||status==="error")?"status":"advance"):"start";
    const response=await loadRouteHistorySnapshot(services,uid,{anchorActivityId:activityId,discipline,action,...(latest?{runId:latest.runId,...(action==="advance"?{expectedVersion:latest.version}:{})}:recovery?{runId:recovery.runId}:{})},latest??undefined);
    if(!current())return;
    if(recovery&&(response.runId!==recovery.runId||response.version<recovery.version||response.expiresAt!==recovery.expiresAt))throw Error("invalid_route_history_response");
    if(response.state==="expired"||!isSaved(response)&&Date.now()>=response.expiresAt){if(saved.current)retire("expired");else clear("expired");return;}
    if(response.state==="invalidated"){if(saved.current)throw Object.assign(Error("run_invalidated"),{code:"failed-precondition"});clear("invalidated");return;}
    latest=response;remember(response);if(response.state==="complete")checkingAccess.current=false;
    checkpointRef.current.write(isSaved(response)?null:{runId:response.runId,version:response.version,expiresAt:response.expiresAt});
    const done=!!recovery||checkOnly||response.state==="complete"||step===ROUTE_HISTORY_MAX_REQUESTS-1;
    setStored({generation:token,status:done?(response.state==="complete"&&document.visibilityState!=="visible"?"hidden":"ready"):"loading",data:response});
    if(done)return;
   }
  }catch(error){if(!current())return;const e=error as{code?:string;message?:string};
   // A failed new calculation can be source-related. Recheck the saved result once;
   // never infer retained authority from a failed-precondition alone.
   const old=saved.current?.entries.find(entry=>entry.runId===saved.current?.selected);
   if(!checkOnly&&old&&(e.code==="failed-precondition"||e.code==="functions/failed-precondition")){
    checkingAccess.current=true;
    try{
     const confirmed=await loadRouteHistorySnapshot(services,uid,{anchorActivityId:activityId,discipline,action:"status",runId:old.runId},old);
     if(!current())return;
     if(!isSaved(confirmed))throw Error("invalid_route_history_response");
     remember(confirmed);checkingAccess.current=false;checkpointRef.current.write(null);
     setStored({generation:token,status:"error",data:confirmed});return;
    }catch(verificationError){
     if(!current())return;
     if(!denied(verificationError)){checkingAccess.current=false;checkpointRef.current.write(null);setStored({generation:token,status:"error",data:old});return;}
    }
   }
   const revoked=["permission-denied","unauthenticated","failed-precondition","not-found"].includes(e.code?.replace("functions/","")??"")||e.message==="account_changed"||e.message==="invalid_route_history_response";
   if(revoked){checkpointRef.current.write(null);saved.current=null;setHistory(null);}
   checkingAccess.current=false;
   setStored({generation:token,status:revoked?"invalidated":"error",data:revoked?null:latest});
  }finally{busy.current=false;setRunning(false);}
 },[available,discipline,auth,app,functions,sdkUser,currentData,status,services,uid,activityId,clear,remember,retire]);
 const inspect=async(runId?:string,more=false)=>{
  if(!available||!discipline||busy.current||auth.currentUser!==sdkUser||document.visibilityState==="hidden")return;
  const token=++generation.current,origin=identity.current;
  const current=()=>generation.current===token&&identity.current===origin&&auth.currentUser===sdkUser&&services.auth===auth&&services.functions===functions&&auth.app===app;
  if(runId)checkingAccess.current=true;
  busy.current=true;setRunning(true);setStored({generation:token,status:"loading",data:currentData});
  try{
   if(runId){
    const previous=saved.current?.entries.find(entry=>entry.runId===runId);
    const response=await loadRouteHistorySnapshot(services,uid,{anchorActivityId:activityId,discipline,action:"status",runId},previous);
    if(!current())return;
    if(!isSaved(response))throw Error("invalid_route_history_response");
    remember(response);checkingAccess.current=false;setStored({generation:token,status:isHidden()?"hidden":"ready",data:response});
   }else{
    const previous=history?.owner===origin?history.page:null;
    const response=await loadRouteHistorySaved(services,uid,{anchorActivityId:activityId,discipline,...(more&&previous?.nextCursor?{cursor:previous.nextCursor}:{})});
    if(!current())return;
    setHistory({owner:origin,page:{...response,items:more&&previous?[...previous.items,...response.items.filter(item=>!previous.items.some(old=>old.runId===item.runId))]:response.items}});
    setStored({generation:token,status:"ready",data:currentData});
   }
  }catch(error){if(current()){
   const revoked=denied(error);checkingAccess.current=false;
   if(revoked){saved.current=null;setHistory(null);checkpointRef.current.write(null);}
   setStored({generation:token,status:revoked?"invalidated":"error",data:revoked?null:currentData});
  }}finally{busy.current=false;setRunning(false);}
 };
 const selected=saved.current?.entries.find(entry=>entry.runId===saved.current?.selected)??null;
 const display=currentData?.state==="complete"?currentData:selected??currentData;
 const lastFocus=useRef(0);
 useEffect(()=>{
  const focus=()=>{if(document.visibilityState!=="visible"||display?.state!=="complete"||busy.current||Date.now()-lastFocus.current<500)return;lastFocus.current=Date.now();void run(false,true);};
  const visibility=()=>{if(display?.state!=="complete")return;if(document.visibilityState==="hidden"){generation.current++;setStored({generation:generation.current,status:"hidden",data:display});}else focus();};
  window.addEventListener("focus",focus);document.addEventListener("visibilitychange",visibility);
  return()=>{window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",visibility);};
 },[display,run]);
 useEffect(()=>{if(!running&&status==="hidden"&&document.visibilityState==="visible")void run(false,true);},[running,status,run]);

 const masked=checkingAccess.current||document.visibilityState==="hidden"||status==="hidden";
 return{history:!masked&&history?.owner===identity.current?history.page:null,loadHistory:(more=false)=>inspect(undefined,more),openSaved:(runId:string)=>inspect(runId),previousResults:saved.current?.entries??[],selectedRun:selected?.runId??null,progress:currentData,canAdvance:!!currentData&&currentData.state!=="complete"||status==="error",previousResult:!!selected&&(currentData?.runId!==selected.runId||status!=="ready"),available,status,running,canRecover:!currentData&&!!checkpoint.value,recover:()=>run(false,true),data:display&&(masked||!isSaved(display)&&status!=="ready")?{...display,best:null}:display,start:()=>run(true),advance:()=>run(false),stop:()=>{if(running&&saved.current)retire();else clear("stopped");}};
}
