import {useEffect,useState} from "react";
// Synthetic fixtures for the real GroupWeekPage. No server writes or reads.
const phase=new URLSearchParams(location.search).get('phase');
export const useAuth=()=>({user:{uid:'fixture-member'}});
export const useGroupMemberRole=()=>({role:'member',loading:false,error:null,retry:()=>{}});
export const useGroup=()=>({group:{id:'fixture',name:'테스트 클럽',description:'함께 달리는 사람들',creatorId:'fixture-owner',memberCount:5},loading:false,error:null,retry:()=>{}});
export const useGroupMembers=()=>({members:[]});
export const useGroupRideStats=()=>({loading:phase==='loading',error:phase==='error'?'failed':null,weeklyStats:['paged','stale'].includes(phase??'')?{totalDistance:123000,totalTime:3600000,totalElevation:200,rideCount:42,activeMembers:45}:null,memberWeekStats:null,retry:()=>{}});

export function useGroupWeekRanking(_groupId: string | undefined, metric: string) {
  const [size,setSize]=useState(20);
  const [stale,setStale]=useState(false);
  useEffect(()=>setSize(20),[metric]);
  return {entries:['paged','stale'].includes(phase??'')&&!stale?Array.from({length:size},(_,i)=>({userId:`rider-${i}`,nickname:`Rider ${i+1}`,distance:45000-i*1000,time:4500000-i*1000,elevation:450-i,tss:0})):[],loading:false,error:stale,moreError:false,loadingMore:false,hasMore:['paged','stale'].includes(phase??'')&&!stale&&size<45,loadMore:()=>phase==='stale'?setStale(true):setSize(value=>Math.min(45,value+20)),retry:()=>{setStale(false);setSize(20)}};
}
