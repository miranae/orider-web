// @vitest-environment jsdom
import { describe,expect,it } from 'vitest';
import { clubVisualParts,profileCheckpoint,profileMapPosition } from './clubCourseVisual';
import { createSeed, loadLocal, saveMeeting, STORAGE_KEY } from './domain';
import { writeDraft,readDraft } from './meetingDrafts';
describe('실제 코스 지도·고도 모델',()=>{
  it('분리 GPX 경로와 프로필 사이를 연결하지 않는다',()=>{
    const meeting={...createSeed().meetings[2]!,courseTrack:{fileName:'split.gpx',distanceKm:2,segmentStarts:[0,2],points:[{lat:37,lon:127,ele:0},{lat:37.01,lon:127,ele:100},{lat:38,lon:128,ele:900},{lat:38.01,lon:128,ele:950}]}};
    const parts=clubVisualParts(meeting);expect(parts).toHaveLength(2);expect(parts[0]!.profile[0]!.elevation).toBe(0);expect(parts[1]!.profile[0]!.distance).toBe(0);expect(parts[0]!.profile[1]!.distance).toBeLessThan(1200);
  });
  it('원본 고도 프로필의 0을 게시 저장·재읽기·초안 복구에 보존하고 잘못된 거리/상한을 거절한다',()=>{
    localStorage.clear();const state=createSeed();const meeting={...state.meetings[2]!,courseTrack:{fileName:'actual',distanceKm:1,points:[{lat:37,lon:127},{lat:37.01,lon:127}],elevationProfile:[{distance:0,elevation:0},{distance:1000,elevation:20}]}};
    const saved=saveMeeting(state,'host',meeting);localStorage.setItem(STORAGE_KEY,JSON.stringify(saved));
    expect(loadLocal().state.meetings[2]!.courseTrack!.elevationProfile).toEqual(meeting.courseTrack.elevationProfile);
    writeDraft('profile',meeting);expect(readDraft('profile').meeting!.courseTrack!.elevationProfile).toEqual(meeting.courseTrack.elevationProfile);
    const descending={...meeting,courseTrack:{...meeting.courseTrack,elevationProfile:[{distance:100,elevation:0},{distance:0,elevation:20}]}};
    expect(()=>saveMeeting(state,'host',descending)).toThrow();expect(()=>writeDraft('bad-profile',descending)).toThrow();
    const oversized={...meeting,courseTrack:{...meeting.courseTrack,elevationProfile:Array.from({length:2001},(_,index)=>({distance:index,elevation:0}))}};
    expect(()=>saveMeeting(state,'host',oversized)).toThrow();expect(()=>writeDraft('bad-profile',oversized)).toThrow();localStorage.clear();
  });
  it('세그먼트의 실제 독립 프로필을 보존하고 샘플 개수와 무관하게 거리로 지도를 보간한다',()=>{
    const meeting={...createSeed().meetings[2]!,segments:[{id:'actual',name:'실제',source:'public-catalog' as const,mode:'함께' as const,instruction:'',elevationGain:100,geometry:[{lat:37,lon:127},{lat:37.01,lon:127},{lat:37.02,lon:127}],elevationProfile:[{distance:0,elevation:0},{distance:500,elevation:40},{distance:1000,elevation:50},{distance:1500,elevation:0}]}]};
    const part=clubVisualParts(meeting)[0]!;expect(part.profile).toEqual(meeting.segments[0]!.elevationProfile);expect(profileMapPosition(part,750)![0]).toBeCloseTo(37.01,5);
    const checkpoint=profileCheckpoint(part,{name:'중간',lat:37.01,lon:127,source:'manual'})!;expect(checkpoint.distance).toBeCloseTo(750,5);expect(checkpoint.elevation).toBeCloseTo(45,5);
    expect(profileCheckpoint(part,{name:'다른 곳',lat:38,lon:128,source:'manual'})).toBeNull();
  });
  it('저장된 경유지 거리는 geometry나 코스 총거리로 다시 비례 계산하지 않는다',()=>{
    const meeting={...createSeed().meetings[2]!,courseTrack:{fileName:'saved',distanceKm:113.33,points:[{lat:37,lon:127},{lat:37.01,lon:127},{lat:37.02,lon:127}],elevationProfile:[{distance:0,elevation:0},{distance:50000,elevation:100},{distance:112500,elevation:0}]}};
    const part=clubVisualParts(meeting)[0]!;const point=profileCheckpoint(part,{name:'보급',lat:37.01,lon:127,source:'course',distanceKm:26.83})!;
    expect(point.distance).toBe(26830);expect(point.elevation).toBeCloseTo(53.66,5);
    expect(profileCheckpoint(part,{name:'범위밖',lat:37.02,lon:127,source:'course',distanceKm:113.33})).toBeNull();
  });
  it('순환 코스에서 같은 좌표인 출발과 도착을 저장된 거리로 구별한다',()=>{
    const meeting={...createSeed().meetings[2]!,courseTrack:{fileName:'loop',distanceKm:2,points:[{lat:37,lon:127},{lat:37.01,lon:127},{lat:37,lon:127}],elevationProfile:[{distance:0,elevation:0},{distance:1000,elevation:100},{distance:2000,elevation:0}]}};
    const part=clubVisualParts(meeting)[0]!;
    expect(profileCheckpoint(part,{name:'출발',lat:37,lon:127,source:'course',distanceKm:0})!.distance).toBe(0);
    expect(profileCheckpoint(part,{name:'도착',lat:37,lon:127,source:'course',distanceKm:2})!.distance).toBe(2000);
    expect(profileMapPosition(part,2000)).toEqual([37,127]);
  });
  it('획고 수치만으로 고도표를 만들지 않고 저장 코스 프로필의 실제 0을 유지한다',()=>{
    const meeting={...createSeed().meetings[2]!,courseTrack:{fileName:'saved',distanceKm:1,points:[{lat:37,lon:127},{lat:37.01,lon:127}],elevationProfile:[{distance:0,elevation:0},{distance:1000,elevation:0}]}};
    expect(clubVisualParts(meeting)[0]!.profile).toEqual(meeting.courseTrack.elevationProfile);
    expect(clubVisualParts({...meeting,courseTrack:{...meeting.courseTrack,elevationProfile:undefined,elevationGainM:400}})[0]!.profile).toEqual([]);
  });
});
