// 합성 계정과 지정한 로컬 에뮬레이터만 사용하는 HTTP 수용 검사.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const project='demo-orider-club-meetings';
const tokens={};
for(const uid of ['club-host','club-rider','club-waiter','club-outsider']) {
 const response=await fetch('http://127.0.0.1:9198/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=club-local-test-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:uid+'@club.test',password:'club-test-2026',returnSecureToken:true})});
 const result=await response.json();assert(response.ok, result.error?.message);tokens[uid]=result.idToken;
}
async function call(uid,name,data) {
 const response=await fetch(`http://127.0.0.1:5109/${project}/asia-northeast3/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens[uid]},body:JSON.stringify({data})});
 const body=await response.json();if(body.error)throw Object.assign(new Error(body.error.message),{code:body.error.status});return body.result;
}
const meeting={title:'HTTP 참석·대기 검증',kindId:'tour',kindName:'투어',date:'2099-10-25',time:'08:00',place:'개발 집결지',capacity:2,description:'운영 데이터와 분리된 HTTP 검증'};
const requestId=randomUUID();const {eventId}=await call('club-host','createClubMeeting',{groupId:'club-development',meeting,requestId});
assert.equal((await call('club-host','createClubMeeting',{groupId:'club-development',meeting,requestId})).eventId,eventId);
await assert.rejects(()=>call('club-outsider','getClubMeetingSnapshot',{eventId}),{code:'PERMISSION_DENIED'});
const joined=await Promise.all(['club-rider','club-waiter'].map(uid=>call(uid,'clubMeetingAttendance',{eventId,action:'join'})));
assert.deepEqual(joined.map(item=>item.status).sort(),['attending','waiting']);
const rider=joined[0].status==='attending'?'club-rider':'club-waiter';const waiter=rider==='club-rider'?'club-waiter':'club-rider';
await call(rider,'clubMeetingAttendance',{eventId,action:'cancel'});
let snap=await call(waiter,'getClubMeetingSnapshot',{eventId});assert.equal(snap.meeting.registrations.find(item=>item.memberId===waiter).status,'offered');assert(!JSON.stringify(snap).includes('offerToken'));
await call(waiter,'clubMeetingAttendance',{eventId,action:'accept-offer'});
snap=await call('club-host','getClubMeetingSnapshot',{eventId});assert.equal(snap.meeting.registrations.filter(item=>item.status==='joined').length,2);
const updatedMeeting={...meeting,courseReady:true,pace:'25–30km/h'};
await call('club-host','updateClubMeeting',{eventId,meeting:updatedMeeting,expectedRevision:snap.revision});
snap=await call('club-host','getClubMeetingSnapshot',{eventId});
assert(snap.meeting.notices.some(notice=>notice.body.includes('준비 중 → 확정')));
assert(!snap.meeting.notices.some(notice=>/true|false/.test(notice.body)));
const privateResponse=await fetch(`http://127.0.0.1:8189/v1/projects/${project}/databases/(default)/documents/events/${eventId}/club_meeting/details`);assert.equal(privateResponse.status,403);
await call('club-host','cancelClubMeeting',{eventId,reason:'로컬 HTTP 검증 완료'});
snap=await call('club-host','getClubMeetingSnapshot',{eventId});assert.equal(snap.meeting.status,'cancelled');assert(snap.meeting.notices.some(n=>n.body.includes('로컬 HTTP 검증 완료')));
console.log(JSON.stringify({passed:true,eventId,checks:['authenticated creator','idempotent create','nonmember denied','concurrent last seat','FIFO offer','offer accepted','safe roster','private details deny','readable change notice','cancellation notice']}));
