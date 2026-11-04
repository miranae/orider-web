// Synthetic fixtures for the real GroupWeekPage. No server writes or reads.
const phase=new URLSearchParams(location.search).get('phase');
export const useAuth=()=>({user:{uid:'fixture-member'}});
export const useGroupMemberRole=()=>({role:'member',loading:false,error:null,retry:()=>{}});
export const useGroup=()=>({group:{id:'fixture',name:'테스트 클럽',description:'함께 달리는 사람들',creatorId:'fixture-owner',memberCount:5},loading:false,error:null,retry:()=>{}});
export const useGroupMembers=()=>({members:[]});
export const useGroupRideStats=()=>({loading:phase==='loading',error:phase==='error'?'failed':null,weeklyStats:null,memberWeekStats:null,retry:()=>{}});
