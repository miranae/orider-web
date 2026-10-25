import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { RouteHistorySnapshotResponse } from "@shared/activity-route-history-snapshot";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { observedRouteAvailable } from "../services/activityRouteEvidence";
import { loadRouteHistorySnapshot } from "../services/activityRouteHistorySnapshot";
type Status = "idle" | "loading" | "error" | "expired" | "invalidated" | "stopped" | "ready" | "hidden";
export function useActivityRouteHistorySnapshot(uid: string, activityId: string, discipline: "bike" | "run" | null, head: string) {
 const services=useFirebaseServices(),{user}=useAuth(),auth=services.auth,app=auth.app,sdkUser=auth.currentUser;
 const available=observedRouteAvailable()&&!!discipline&&!!user&&!user.isAnonymous&&user.uid===uid&&!!sdkUser&&!sdkUser.isAnonymous&&sdkUser.uid===uid;
 const scope=JSON.stringify([uid,activityId,discipline,head,available]);
 const identity=useRef({scope,services,auth,app,sdkUser}),generation=useRef(0),busy=useRef(false);
 if(identity.current.scope!==scope||identity.current.services!==services||identity.current.auth!==auth||identity.current.app!==app||identity.current.sdkUser!==sdkUser){identity.current={scope,services,auth,app,sdkUser};generation.current++;}
 const [running,setRunning]=useState(false);
 const [stored,setStored]=useState<{generation:number;status:Status;data:RouteHistorySnapshotResponse|null}>({generation:0,status:"idle",data:null});
 const currentData=stored.generation===generation.current?stored.data:null;
 const status=stored.generation===generation.current?stored.status:"idle";
 const clear=useCallback((next:Status)=>{generation.current++;setStored({generation:generation.current,status:next,data:null});},[]);
 useEffect(()=>{let before=auth.currentUser;return onAuthStateChanged(auth,next=>{if(next!==before){before=next;clear("invalidated");}});},[auth,clear]);
 useEffect(()=>{const invalidate=()=>clear("invalidated");window.addEventListener("orider:activity-content-changed",invalidate);return()=>window.removeEventListener("orider:activity-content-changed",invalidate);},[clear]);
 useEffect(()=>()=>{generation.current++;},[]);
 useEffect(()=>{if(!currentData)return;const delay=currentData.expiresAt-Date.now();if(delay<=0){clear("expired");return;}const timer=setTimeout(()=>clear("expired"),delay);return()=>clearTimeout(timer);},[currentData,clear]);
 const run=useCallback(async(restart:boolean,checkOnly=false)=>{
  if(!available||!discipline||busy.current||auth.currentUser!==sdkUser||auth.app!==app)return;
  let latest=restart?null:currentData;
  if(!restart&&(!latest||!checkOnly&&latest.state==="complete"&&status!=="error"||Date.now()>=latest.expiresAt))return;
  if(restart)generation.current++;
  const token=generation.current,identityAtStart=identity.current;
  const current=()=>generation.current===token&&identity.current===identityAtStart&&services.auth===auth&&auth.app===app&&auth.currentUser===sdkUser;
  busy.current=true;setRunning(true);setStored({generation:token,status:"loading",data:latest});
  try{
   for(let step=0;step<(checkOnly?1:20);step++){
    if(!current())return;
    const action=latest?(step===0&&(checkOnly||status==="error")?"status":"advance"):"start";
    const response=await loadRouteHistorySnapshot(services,uid,{anchorActivityId:activityId,discipline,action,...(latest?{runId:latest.runId,...(action==="advance"?{expectedVersion:latest.version}:{})}:{})},latest??undefined);
    if(!current())return;
    if(response.state==="expired"||Date.now()>=response.expiresAt){clear("expired");return;}
    if(response.state==="invalidated"){clear("invalidated");return;}
    latest=response;
    const done=checkOnly||response.state==="complete"||step===19;
    setStored({generation:token,status:done?(response.state==="complete"&&document.visibilityState!=="visible"?"hidden":"ready"):"loading",data:response});
    if(done)return;
   }
  }catch(error){if(!current())return;const e=error as{code?:string;message?:string};const revoked=["permission-denied","unauthenticated","failed-precondition","not-found"].includes(e.code?.replace("functions/","")??"")||e.message==="account_changed"||e.message==="invalid_route_history_response";
   setStored({generation:token,status:revoked?"invalidated":"error",data:revoked?null:latest});
  }finally{busy.current=false;setRunning(false);}
 },[available,discipline,auth,app,sdkUser,currentData,status,services,uid,activityId,clear]);
 const lastFocus=useRef(0);
 useEffect(()=>{
  const focus=()=>{if(document.visibilityState!=="visible"||currentData?.state!=="complete"||busy.current||Date.now()-lastFocus.current<500)return;lastFocus.current=Date.now();void run(false,true);};
  const visibility=()=>{if(currentData?.state!=="complete")return;if(document.visibilityState==="hidden"){generation.current++;setStored({generation:generation.current,status:"hidden",data:currentData});}else focus();};
  window.addEventListener("focus",focus);document.addEventListener("visibilitychange",visibility);
  return()=>{window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",visibility);};
 },[currentData,run]);
 useEffect(()=>{if(!running&&status==="hidden"&&document.visibilityState==="visible")void run(false,true);},[running,status,run]);

 return{available,status,running,data:currentData&&status!=="ready"?{...currentData,best:null}:currentData,start:()=>run(true),advance:()=>run(false),stop:()=>clear("stopped")};
}
