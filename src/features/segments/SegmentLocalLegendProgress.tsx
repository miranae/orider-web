import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SegmentLegendProgressResponse } from "@shared/types/segment-local-legend-progress";
import { useAuth } from "../../contexts/AuthContext";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { localTrainingEmulatorAvailable } from "../../services/localTrainingEmulator";
import { loadLegendProgress } from "../../services/segmentLocalLegendProgress";
import { Button, Stack, Text } from "../../theme/components";
export default function SegmentLocalLegendProgress({segmentId}:{segmentId:string}){
 const {t}=useTranslation("segment"),{user}=useAuth(),services=useFirebaseServices(),sdk=services.auth.currentUser;
 const owner=useRef({segmentId,user,sdk,services}),epoch=useRef(0),busy=useRef(false);
 if(owner.current.segmentId!==segmentId||owner.current.user!==user||owner.current.sdk!==sdk||owner.current.services!==services){owner.current={segmentId,user,sdk,services};epoch.current++;}
 const [stored,setStored]=useState<{epoch:number;run:SegmentLegendProgressResponse|null;error:boolean;stale:boolean}>({epoch:0,run:null,error:false,stale:false});
 const [running,setRunning]=useState(false),run=stored.epoch===epoch.current?stored.run:null;
 const stale=stored.epoch!==epoch.current||stored.stale;
 const clear=(forget=false)=>{epoch.current++;setStored({epoch:epoch.current,run:forget?null:run?{...run,result:null,finalAsOf:null}:null,error:false,stale:true});};
 useEffect(()=>()=>{epoch.current++;},[]);
 useEffect(()=>{
  const hide=()=>{if(document.visibilityState==="hidden")clear();};
  document.addEventListener("visibilitychange",hide);
  const focus=()=>{if(run?.result)clear();};window.addEventListener("focus",focus);
  const timer=run?.result?setTimeout(()=>clear(),Math.min(30000,Math.max(0,run.expiresAt-Date.now()))):undefined;
  return()=>{document.removeEventListener("visibilitychange",hide);window.removeEventListener("focus",focus);if(timer)clearTimeout(timer);};
 },[run]);
 useEffect(()=>{
  if(!run||run.state==="expired")return;
  const timer=setTimeout(()=>{epoch.current++;setStored({epoch:epoch.current,run:{...run,state:"expired",result:null,finalAsOf:null},error:false,stale:true});},Math.max(0,run.expiresAt-Date.now()));
  return()=>clearTimeout(timer);
 },[run]);
 async function start(restart:boolean){
  if(!user||user.isAnonymous||!sdk||sdk.isAnonymous||sdk.uid!==user.uid||busy.current)return;
  const origin=owner.current,token=++epoch.current;
  const current=()=>token===epoch.current&&owner.current===origin&&services.auth.currentUser===sdk&&document.visibilityState!=="hidden";
  let latest=restart||(run&&Date.now()>=run.expiresAt)?null:run;
  busy.current=true;setRunning(true);setStored({epoch:token,run:latest?{...latest,result:null,finalAsOf:null}:null,error:false,stale:true});
  try{
   for(let i=0;i<32;i++){
    if(!current())return;
    const action=!latest?"start":i===0?"status":latest.state==="census"?"advance":"finalize";
    if(latest&&(Date.now()>=latest.expiresAt||latest.state==="limit"||latest.state==="expired"))break;
    latest=await loadLegendProgress(services,user.uid,{segmentId,action,...(latest?{runId:latest.runId,...(["advance","finalize"].includes(action)?{expectedVersion:latest.version}:{})}:{})},latest??undefined);
    if(!current())return;
    setStored({epoch:token,run:latest,error:false,stale:false});
    if(["complete","limit","expired"].includes(latest.state))break;
   }
  }catch{if(current())setStored({epoch:token,run:latest?{...latest,result:null,finalAsOf:null}:null,error:true,stale:true});}
  finally{busy.current=false;setRunning(false);}
 }
 if(!localTrainingEmulatorAvailable())return null;
 const result=!stale?run?.result:null;
 return <Stack gap="var(--space-2)">
  <Text as="p">{t("legendProgress.intro")}</Text>
  <Button disabled={running||!user||user.isAnonymous} onClick={()=>void start(!run||run.state==="expired"||run.state==="limit"||Date.now()>=run.expiresAt)}>{t(run&&run.state!=="expired"&&run.state!=="limit"&&Date.now()<run.expiresAt?"legendProgress.resume":"legendProgress.start")}</Button>
  {running&&<><Text role="status">{t("legendProgress.loading",{steps:run?.steps??0})}</Text><Button variant="ghost" onClick={()=>clear(true)}>{t("legendProgress.stop")}</Button></>}
  {stored.epoch===epoch.current&&stored.error&&<Text role="alert">{t("safeLegend.error")}</Text>}
  {run?.state==="limit"&&<Text role="status">{t("legendProgress.limit")}</Text>}
  {run?.state==="expired"&&<Text role="status">{t("legendProgress.expired")}</Text>}
  {result&&<><Text role="status">{t("safeLegend.complete",{count:result.scannedCount,total:result.totalEfforts,riders:result.riderCount})}</Text>
   <Text>{result.leader?t("safeLegend.leader",{name:result.leader.nickname||t("nativeBoard.rider"),count:result.leader.effortCount}):t("safeLegend.minimum")}</Text>
   <Text variant="caption">{t("legendProgress.checked",{time:new Date(run!.finalAsOf!).toLocaleTimeString()})}</Text></>}
 </Stack>;
}
