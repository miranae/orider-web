import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { BikePeriodSnapshotResponse, BikePeriodHistoryResponse } from "@shared/types/bike-period-snapshot";
import type { PowerCurvePeriod } from "@shared/types/power-curve-periods";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadBikeSnapshot, loadBikeSnapshotHistory } from "../services/bikePeriodSnapshot";
export function useBikePeriodSnapshot(uid:string,period:PowerCurvePeriod){
 useAuth();
 const services=useFirebaseServices(),auth=services.auth,app=auth.app,functions=services.functions,sdk=auth.currentUser;
 const scope=JSON.stringify([uid,period.fromInclusive,period.toExclusive]);
 const owner=useRef({scope,services,auth,app,functions,sdk}),generation=useRef(0),busy=useRef(false);
 if(owner.current.scope!==scope||owner.current.services!==services||owner.current.auth!==auth||owner.current.app!==app||owner.current.functions!==functions||owner.current.sdk!==sdk){owner.current={scope,services,auth,app,functions,sdk};generation.current++;}
 const [state,setState]=useState<{token:number;data:BikePeriodSnapshotResponse|null;error:boolean;hidden:boolean;errorKind?:"network"|"invalidated"|"limit"}>({token:0,data:null,error:false,hidden:false});
 const [running,setRunning]=useState(false);
 const saved=useRef<{owner:typeof owner.current;data:BikePeriodSnapshotResponse;previous:BikePeriodSnapshotResponse[]}|null>(null);
 if(saved.current?.owner!==owner.current)saved.current=null;
 const [selectedRun,setSelectedRun]=useState<string|null>(null);
 const [history,setHistory]=useState<{owner:typeof owner.current;page:BikePeriodHistoryResponse}|null>(null);
 const data=state.token===generation.current?state.data:null;
 const dataRef=useRef(data);dataRef.current=data;
 const invalidate=useCallback((forget=false)=>{generation.current++;if(forget){saved.current=null;setHistory(null);}const value=forget?null:dataRef.current;dataRef.current=value;setState({token:generation.current,data:value,error:false,hidden:true});},[]);
 useEffect(()=>()=>{generation.current++;},[]);
 useEffect(()=>{let before=auth.currentUser;return onAuthStateChanged(auth,next=>{if(next!==before){before=next;invalidate(true);}});},[auth,invalidate]);
 useEffect(()=>{const changed=()=>invalidate(!saved.current);window.addEventListener("orider:activity-content-changed",changed);return()=>window.removeEventListener("orider:activity-content-changed",changed);},[invalidate]);
 useEffect(()=>{if(!data||data.state==="complete"&&data.retention==="saved_result")return;const timer=setTimeout(()=>invalidate(true),Math.max(0,data.expiresAt-Date.now()));return()=>clearTimeout(timer);},[data,invalidate]);
 const run=useCallback(async(restart=false,zones=false,checkOnly=false)=>{
  if(busy.current||!sdk||sdk.isAnonymous||sdk.uid!==uid||auth.currentUser!==sdk||services.auth!==auth||auth.app!==app||services.functions!==functions||document.visibilityState==="hidden")return;
  let latest=restart?null:dataRef.current;
  if(zones&&latest?.state!=="complete")return;
  if(!restart&&!latest)return;
  const token=++generation.current,origin=owner.current,current=()=>token===generation.current&&owner.current===origin&&services.auth===auth&&auth.currentUser===sdk&&auth.app===app&&services.functions===functions&&document.visibilityState!=="hidden";
  busy.current=true;setRunning(true);setState({token,data:latest,error:false,hidden:checkOnly||state.hidden&&!restart&&!zones});
  try{
   for(let step=0;step<(zones||checkOnly?1:2000);step++){
    if(!current())return;
    if(latest&&!(latest.state==="complete"&&latest.retention==="saved_result")&&Date.now()>=latest.expiresAt){invalidate(true);return;}
    const action=zones?"zones":!latest?"start":step===0?"status":"advance";
    const next=await loadBikeSnapshot(services,uid,{action,period,...(latest?{runId:latest.runId,...(action==="advance"?{expectedVersion:latest.version}:{}),...(zones&&latest.nextZone?{afterZone:latest.nextZone}:{})}:{})},latest??undefined);
    if(!current())return;
    latest=next;dataRef.current=next;
    if(next.state==="complete"&&restart)setSelectedRun(null);
    if(next.state==="complete"&&next.result)saved.current={owner:origin,data:next,previous:saved.current?.data.runId!==next.runId&&saved.current ? [...saved.current.previous,saved.current.data] : saved.current?.previous??[]};
    setState({token,data:next,error:false,hidden:false});
    if(["complete","invalidated","expired"].includes(next.state))break;
   }
  }catch(error){if(current()){
   const e=error as{code?:string;message?:string;details?:{reason?:string}};const denied=["permission-denied","unauthenticated","failed-precondition","not-found"].includes(e.code?.replace("functions/","")??"")||["account_changed","invalid_bike_snapshot"].includes(e.message??"");
   const limit=e.details?.reason==="identity_component_too_large";
   if(denied||limit){dataRef.current=null;latest=null;}
   if(denied){saved.current=null;setHistory(null);}
   if(!latest&&saved.current){latest=saved.current.data;dataRef.current=latest;}
   setState({token,data:latest,error:true,hidden:false,errorKind:limit?"limit":denied?"invalidated":"network"});
  }}finally{busy.current=false;setRunning(false);}
 },[services,auth,app,functions,sdk,uid,period.fromInclusive,period.toExclusive,invalidate,state.hidden]);
 const inspectHistory=async(runId?:string,more=false,zones=false,check=false)=>{
  if(busy.current||!sdk||sdk.isAnonymous||sdk.uid!==uid||auth.currentUser!==sdk||document.visibilityState==="hidden")return;
  const origin=owner.current,token=++generation.current;
  const current=()=>token===generation.current&&owner.current===origin&&auth.currentUser===sdk&&services.auth===auth&&services.functions===functions&&auth.app===app;
  busy.current=true;setRunning(true);setState({token,data:dataRef.current,error:false,hidden:check});
  try{
   if(runId){
    const previous=saved.current?.data.runId===runId?saved.current.data:saved.current?.previous.find(old=>old.runId===runId);
    const next=await loadBikeSnapshot(services,uid,{action:zones?"zones":"status",period,runId,...(zones&&previous?.nextZone?{afterZone:previous.nextZone}:{})},previous);
    if(!current())return;if(next.state!=="complete"||!next.result)throw Error("saved_bike_result_unavailable");
    if(saved.current){
     if(saved.current.data.runId===next.runId){saved.current.data=next;dataRef.current=next;setSelectedRun(null);}
     else{saved.current.previous=[...saved.current.previous.filter(old=>old.runId!==next.runId),next];setSelectedRun(next.runId);}
    }else{saved.current={owner:origin,data:next,previous:[]};dataRef.current=next;setSelectedRun(null);}
   }else{
    const previous=history?.owner===origin?history.page:null;
    const next=await loadBikeSnapshotHistory(services,uid,{period,...(more&&previous?.nextCursor?{cursor:previous.nextCursor}:{})});
    if(!current())return;
    setHistory({owner:origin,page:{...next,items:more&&previous?[...previous.items,...next.items.filter(item=>!previous.items.some(old=>old.runId===item.runId))]:next.items}});
   }
   if(current())setState({token,data:dataRef.current,error:false,hidden:false});
  }catch(error){if(current()){
   const e=error as{code?:string;message?:string};const denied=["permission-denied","unauthenticated","not-found","failed-precondition"].includes(e.code?.replace("functions/","")??"")||e.message==="account_changed";
   if(denied){saved.current=null;dataRef.current=null;setHistory(null);}
   setState({token,data:dataRef.current,error:true,hidden:false,errorKind:denied?"invalidated":"network"});
  }}finally{busy.current=false;setRunning(false);}
 };
 const inspection=useRef(inspectHistory);inspection.current=inspectHistory;
 const lastFocus=useRef(0);
 useEffect(()=>{
  const focus=()=>{if(document.visibilityState!=="visible"||!selectedRun&&dataRef.current?.state!=="complete"||busy.current||Date.now()-lastFocus.current<500)return;lastFocus.current=Date.now();if(selectedRun)void inspection.current(selectedRun,false,false,true);else void run(false,false,true);};
  const visibility=()=>{if(document.visibilityState==="hidden")invalidate();else focus();};
  window.addEventListener("focus",focus);document.addEventListener("visibilitychange",visibility);
  return()=>{window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",visibility);};
 },[run,invalidate,selectedRun]);
 useEffect(()=>{if(!running&&state.token===generation.current&&state.hidden&&!state.error&&data?.state==="complete"&&document.visibilityState==="visible"){if(selectedRun)void inspection.current(selectedRun,false,false,true);else void run(false,false,true);}},[running,state,data,run,selectedRun]);
 const selected=saved.current?.previous.find(old=>old.runId===selectedRun);
 const display=selected??(data?.state==="complete"&&data.result?data:saved.current?.data??data);
 const masked=document.visibilityState==="hidden"||state.hidden;
 const cancel=()=>{generation.current++;const previous=saved.current?.data??null;dataRef.current=previous;setState({token:generation.current,data:previous,error:false,hidden:false});};
 return {history:document.visibilityState!=="hidden"&&history?.owner===owner.current?history.page:null,loadHistory:(more=false)=>inspectHistory(undefined,more),openSaved:(runId:string)=>inspectHistory(runId),previousResults:saved.current?.previous??[],selectedRun:selected?.runId??null,selectPrevious:(runId:string|null)=>runId?inspectHistory(runId):setSelectedRun(null),data:display&&masked?{...display,result:null,zoneGroups:[]}:display,progressScanned:data?.scanned??0,running,error:state.token===generation.current&&state.error,
  errorKind:state.token===generation.current?state.errorKind:undefined,canResume:!!data&&!["expired","invalidated"].includes(data.state),start:()=>run(true),resume:()=>run(),zones:()=>selectedRun?inspectHistory(selectedRun,false,true):run(false,true),stop:cancel};
}
