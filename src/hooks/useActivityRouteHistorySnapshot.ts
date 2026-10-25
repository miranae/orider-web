import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { RouteHistorySnapshotResponse } from "@shared/activity-route-history-snapshot";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { observedRouteAvailable } from "../services/activityRouteEvidence";
import { loadRouteHistorySnapshot } from "../services/activityRouteHistorySnapshot";
type Status = "idle" | "loading" | "error" | "expired" | "invalidated" | "stopped" | "ready";
export function useActivityRouteHistorySnapshot(uid: string, activityId: string, discipline: "bike" | "run" | null, head: string) {
 const services=useFirebaseServices(),{user}=useAuth(),auth=services.auth,app=auth.app,sdkUser=auth.currentUser;
 const available=observedRouteAvailable()&&!!discipline&&!!user&&!user.isAnonymous&&user.uid===uid&&!!sdkUser&&!sdkUser.isAnonymous&&sdkUser.uid===uid;
 const scope=JSON.stringify([uid,activityId,discipline,head,available]);
 const identity=useRef({scope,services,auth,app,sdkUser}),generation=useRef(0),busy=useRef(false);
 if(identity.current.scope!==scope||identity.current.services!==services||identity.current.auth!==auth||identity.current.app!==app||identity.current.sdkUser!==sdkUser){identity.current={scope,services,auth,app,sdkUser};generation.current++;busy.current=false;}
 const [stored,setStored]=useState<{generation:number;status:Status;data:RouteHistorySnapshotResponse|null}>({generation:0,status:"idle",data:null});
 const currentData=stored.generation===generation.current?stored.data:null;
 const status=stored.generation===generation.current?stored.status:"idle";
 const clear=useCallback((next:Status)=>{generation.current++;busy.current=false;setStored({generation:generation.current,status:next,data:null});},[]);
 useEffect(()=>{let before=auth.currentUser;return onAuthStateChanged(auth,next=>{if(next!==before){before=next;clear("invalidated");}});},[auth,clear]);
 useEffect(()=>{const invalidate=()=>clear("invalidated");window.addEventListener("orider:activity-content-changed",invalidate);return()=>window.removeEventListener("orider:activity-content-changed",invalidate);},[clear]);
 useEffect(()=>()=>{generation.current++;busy.current=false;},[]);
 useEffect(()=>{if(!currentData)return;const delay=currentData.expiresAt-Date.now();if(delay<=0){clear("expired");return;}const timer=setTimeout(()=>clear("expired"),delay);return()=>clearTimeout(timer);},[currentData,clear]);
 const run=useCallback(async(restart:boolean)=>{
  if(!available||!discipline||busy.current||auth.currentUser!==sdkUser||auth.app!==app)return;
  const previous=restart?null:currentData;
  if(!restart&&(!previous||previous.state==="complete"||Date.now()>=previous.expiresAt))return;
  if(restart)generation.current++;
  const token=generation.current,identityAtStart=identity.current;
  const current=()=>generation.current===token&&identity.current===identityAtStart&&services.auth===auth&&auth.app===app&&auth.currentUser===sdkUser;
  busy.current=true;setStored({generation:token,status:"loading",data:previous});
  try{
   const response=await loadRouteHistorySnapshot(services,uid,{anchorActivityId:activityId,discipline,action:restart?"start":status==="error"?"status":"advance",...(previous?{runId:previous.runId,expectedVersion:previous.version}:{})},previous??undefined);
   if(!current())return;
   if(response.state==="expired"||Date.now()>=response.expiresAt){clear("expired");return;}
   if(response.state==="invalidated"){clear("invalidated");return;}
   setStored({generation:token,status:"ready",data:response});
  }catch(error){if(!current())return;const e=error as{code?:string;message?:string};const revoked=["permission-denied","unauthenticated","failed-precondition","not-found"].includes(e.code?.replace("functions/","")??"")||e.message==="account_changed"||e.message==="invalid_route_history_response";
   setStored({generation:token,status:revoked?"invalidated":"error",data:revoked?null:previous});
  }finally{if(current())busy.current=false;}
 },[available,discipline,auth,app,sdkUser,currentData,status,services,uid,activityId,clear]);
 return{available,status,data:currentData,start:()=>run(true),advance:()=>run(false),stop:()=>clear("stopped")};
}
