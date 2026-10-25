import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { BikePeriodSnapshotResponse } from "@shared/types/bike-period-snapshot";
import type { PowerCurvePeriod } from "@shared/types/power-curve-periods";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadBikeSnapshot } from "../services/bikePeriodSnapshot";
export function useBikePeriodSnapshot(uid:string,period:PowerCurvePeriod){
 useAuth();
 const services=useFirebaseServices(),auth=services.auth,app=auth.app,functions=services.functions,sdk=auth.currentUser;
 const scope=JSON.stringify([uid,period.fromInclusive,period.toExclusive]);
 const owner=useRef({scope,services,auth,app,functions,sdk}),generation=useRef(0),busy=useRef(false);
 if(owner.current.scope!==scope||owner.current.services!==services||owner.current.auth!==auth||owner.current.app!==app||owner.current.functions!==functions||owner.current.sdk!==sdk){owner.current={scope,services,auth,app,functions,sdk};generation.current++;}
 const [state,setState]=useState<{token:number;data:BikePeriodSnapshotResponse|null;error:boolean;hidden:boolean;errorKind?:"network"|"invalidated"|"limit"}>({token:0,data:null,error:false,hidden:false});
 const [running,setRunning]=useState(false);
 const data=state.token===generation.current?state.data:null;
 const dataRef=useRef(data);dataRef.current=data;
 const invalidate=useCallback((forget=false)=>{generation.current++;const value=forget?null:dataRef.current;dataRef.current=value;setState({token:generation.current,data:value,error:false,hidden:true});},[]);
 useEffect(()=>()=>{generation.current++;},[]);
 useEffect(()=>{let before=auth.currentUser;return onAuthStateChanged(auth,next=>{if(next!==before){before=next;invalidate(true);}});},[auth,invalidate]);
 useEffect(()=>{const changed=()=>invalidate(true);window.addEventListener("orider:activity-content-changed",changed);return()=>window.removeEventListener("orider:activity-content-changed",changed);},[invalidate]);
 useEffect(()=>{if(!data)return;const timer=setTimeout(()=>invalidate(true),Math.max(0,data.expiresAt-Date.now()));return()=>clearTimeout(timer);},[data,invalidate]);
 const run=useCallback(async(restart=false,zones=false,checkOnly=false)=>{
  if(busy.current||!sdk||sdk.isAnonymous||sdk.uid!==uid||auth.currentUser!==sdk||services.auth!==auth||auth.app!==app||services.functions!==functions||document.visibilityState==="hidden")return;
  let latest=restart?null:dataRef.current;
  if(zones&&latest?.state!=="complete")return;
  if(!restart&&!latest)return;
  const token=++generation.current,origin=owner.current,current=()=>token===generation.current&&owner.current===origin&&services.auth===auth&&auth.currentUser===sdk&&auth.app===app&&services.functions===functions&&document.visibilityState!=="hidden";
  busy.current=true;setRunning(true);setState({token,data:latest,error:false,hidden:true});
  try{
   for(let step=0;step<(zones||checkOnly?1:2000);step++){
    if(!current())return;
    if(latest&&Date.now()>=latest.expiresAt){invalidate(true);return;}
    const action=zones?"zones":!latest?"start":step===0?"status":"advance";
    const next=await loadBikeSnapshot(services,uid,{action,period,...(latest?{runId:latest.runId,...(action==="advance"?{expectedVersion:latest.version}:{}),...(zones&&latest.nextZone?{afterZone:latest.nextZone}:{})}:{})},latest??undefined);
    if(!current())return;
    latest=next;dataRef.current=next;
    setState({token,data:next,error:false,hidden:false});
    if(["complete","invalidated","expired"].includes(next.state))break;
   }
  }catch(error){if(current()){
   const e=error as{code?:string;message?:string;details?:{reason?:string}};const denied=["permission-denied","unauthenticated","failed-precondition","not-found"].includes(e.code?.replace("functions/","")??"")||["account_changed","invalid_bike_snapshot"].includes(e.message??"");
   const limit=e.details?.reason==="identity_component_too_large";
   if(denied||limit){dataRef.current=null;latest=null;}
   setState({token,data:latest,error:true,hidden:true,errorKind:limit?"limit":denied?"invalidated":"network"});
  }}finally{busy.current=false;setRunning(false);}
 },[services,auth,app,functions,sdk,uid,period.fromInclusive,period.toExclusive,invalidate]);
 const lastFocus=useRef(0);
 useEffect(()=>{
  const focus=()=>{if(document.visibilityState!=="visible"||dataRef.current?.state!=="complete"||busy.current||Date.now()-lastFocus.current<500)return;lastFocus.current=Date.now();void run(false,false,true);};
  const visibility=()=>{if(document.visibilityState==="hidden")invalidate();else focus();};
  window.addEventListener("focus",focus);document.addEventListener("visibilitychange",visibility);
  return()=>{window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",visibility);};
 },[run,invalidate]);
 useEffect(()=>{if(!running&&state.token===generation.current&&state.hidden&&!state.error&&data?.state==="complete"&&document.visibilityState==="visible")void run(false,false,true);},[running,state,data,run]);
 return {data:data&&(state.hidden||state.error||running)?{...data,result:null,zoneGroups:[]}:data,running,error:state.token===generation.current&&state.error,
  errorKind:state.token===generation.current?state.errorKind:undefined,canResume:!!data&&!["expired","invalidated"].includes(data.state),start:()=>run(true),resume:()=>run(),zones:()=>run(false,true),stop:()=>invalidate(true)};
}
