// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CoursePreparation from './CoursePreparation';
vi.mock('./ClubCourseMap',()=>({default:()=>null}));
import CoursePreview from './CoursePreview';
import MeetingForm from './MeetingForm';
import { latestDraft } from './meetingDrafts';
import { createSeed, type Meeting } from './domain';
import { readSegmentCoursePlan } from './meetingCoursePlan';
import type { MeetingSegment } from './segmentCatalog';
const first: MeetingSegment={id:'river',name:'강변',distance:3200,elevationGain:0,source:'public-catalog',mode:'함께',instruction:'',geometry:[{lat:37,lon:127},{lat:37.01,lon:127.01}]};
const second: MeetingSegment={...first,id:'hill',name:'언덕',distance:1800,elevationGain:120};
vi.mock('./MeetingSegments',()=>({default:({selected,onChange}:{selected:MeetingSegment[];onChange:(segments:MeetingSegment[])=>void})=><><button onClick={()=>onChange([...selected,first])}>첫 구간 추가</button><button onClick={()=>onChange([...selected,second])}>두번째 구간 추가</button><button onClick={()=>onChange([...selected].reverse())}>순서 바꾸기</button><button onClick={()=>onChange(selected.slice(1))}>첫 구간 제거</button><button onClick={()=>onChange(selected.map(segment=>({...segment,mode:'오픈',instruction:'정상에서 만나요.'})))}>안내만 수정</button></>,MeetingSegmentCards:()=>null}));
function Harness({initial}:{initial:Meeting}) {const[meeting,setMeeting]=useState(initial);return <><CoursePreparation meeting={meeting} onChange={setMeeting} onBusyChange={vi.fn()}/><output aria-label="선택 결과">{JSON.stringify(meeting)}</output><CoursePreview meeting={meeting}/></>;}
const result=()=>JSON.parse(screen.getByLabelText('선택 결과').textContent!) as Meeting;
afterEach(cleanup);
describe('구간 선택 시 코스 정보 자동 반영',()=>{
  it('추가·순서 변경·제거 시 수치와 지점을 재계산하고 직접 추가한 지점은 유지한다',()=>{
    render(<Harness initial={{...createSeed().meetings[2]!,courseSource:{kind:'segments',name:'기존 구간'},distanceKm:undefined,elevationGainM:undefined,courseStops:[],segments:[],courseCheckpoints:[{name:'직접 정한 만남',source:'manual',note:'물 채우기'}]}}/>);
    fireEvent.click(screen.getByRole('button',{name:'첫 구간 추가'}));expect(result().distanceKm).toBe(3.2);expect(result().elevationGainM).toBe(0);expect(result().courseCheckpoints).toHaveLength(3);
    fireEvent.click(screen.getByRole('button',{name:'두번째 구간 추가'}));expect(result().distanceKm).toBe(5);expect(result().elevationGainM).toBe(120);expect(result().courseCheckpoints).toHaveLength(5);
    fireEvent.click(screen.getByRole('button',{name:'순서 바꾸기'}));expect(result().courseCheckpoints![0]!.name).toBe('언덕 · 출발');expect(result().courseCheckpoints![1]!.distanceKm).toBe(1.8);
    fireEvent.click(screen.getByRole('button',{name:'첫 구간 제거'}));expect(result().distanceKm).toBe(3.2);expect(result().courseCheckpoints!.map(point=>point.name)).toEqual(['강변 · 출발','강변 · 도착','직접 정한 만남']);
    expect(screen.getByRole('region',{name:'코스 체크포인트'}).textContent).toContain('선택 구간 누적 3.2km');
    fireEvent.click(screen.getByRole('button',{name:'첫 구간 제거'}));expect(result().distanceKm).toBeUndefined();expect(result().elevationGainM).toBeUndefined();expect(result().courseCheckpoints).toEqual([{name:'직접 정한 만남',source:'manual',note:'물 채우기'}]);
  });
  it('진행 방식·안내만 고칠 때 보정한 수치와 체크포인트를 보존한다',()=>{
    const initial:Meeting={...createSeed().meetings[2]!,courseSource:readSegmentCoursePlan([first]).source,distanceKm:4,elevationGainM:15,segments:[first],courseCheckpoints:[{name:'수정한 출발',source:'segments',note:'모여요.'}]};
    render(<Harness initial={initial}/>);fireEvent.click(screen.getByRole('button',{name:'안내만 수정'}));
    expect(result().distanceKm).toBe(4);expect(result().elevationGainM).toBe(15);expect(result().courseCheckpoints).toEqual(initial.courseCheckpoints);expect(result().segments![0]).toMatchObject({mode:'오픈',instruction:'정상에서 만나요.'});
  });
  it('추가·순서 변경 후에도 기존 구간 지점의 이름과 메모를 보존하고 거리는 재계산한다',()=>{
    const plan=readSegmentCoursePlan([first]);plan.checkpoints[0] = {...plan.checkpoints[0]!,name:'정한 출발',note:'출발 전 연락',type:'재집결'};
    render(<Harness initial={{...createSeed().meetings[2]!,courseSource:plan.source,segments:plan.segments,courseCheckpoints:plan.checkpoints}}/>);
    fireEvent.click(screen.getByRole('button',{name:'두번째 구간 추가'}));fireEvent.click(screen.getByRole('button',{name:'순서 바꾸기'}));
    const point=result().courseCheckpoints!.find(item=>item.segmentId==='river'&&item.segmentEndpoint==='start');
    expect(point).toMatchObject({name:'정한 출발',note:'출발 전 연락',type:'재집결',distanceKm:1.8});
  });
  it('다른 코스에서 변경할 때 확인·취소를 유지한다',()=>{
    render(<Harness initial={createSeed().meetings[2]!}/>);fireEvent.click(screen.getByRole('tab',{name:'세그먼트로 준비하기'}));fireEvent.click(screen.getByRole('button',{name:'첫 구간 추가'}));
    expect(result().distanceKm).toBe(86);fireEvent.click(screen.getByRole('button',{name:'변경 취소'}));expect(result().distanceKm).toBe(86);
    fireEvent.click(screen.getByRole('button',{name:'첫 구간 추가'}));fireEvent.click(screen.getByRole('button',{name:'확인하고 적용'}));expect(result().distanceKm).toBe(3.2);expect(result().courseCheckpoints).toHaveLength(2);
  });
  it('자동 반영한 구간 수치와 지점을 초안 복구·모집글 미리보기에 보존한다',()=>{
    localStorage.clear();const state=createSeed();const initial:Meeting={...state.meetings[2]!,id:'segment-draft',hostId:'me',courseSource:readSegmentCoursePlan([]).source,segments:[],courseCheckpoints:[],courseStops:[],distanceKm:undefined,elevationGainM:undefined};
    const view=render(<MeetingForm state={state} initial={initial} onSave={vi.fn()} onClose={vi.fn()}/>);
    fireEvent.click(screen.getByRole('button',{name:'첫 구간 추가'}));expect(latestDraft().meeting).toMatchObject({distanceKm:3.2,elevationGainM:0});expect(latestDraft().meeting?.courseCheckpoints).toHaveLength(2);
    view.unmount();render(<MeetingForm state={state} initial={initial} onSave={vi.fn()} onClose={vi.fn()}/>);
    fireEvent.click(screen.getAllByRole('button',{name:'모집글 미리보기'})[0]!);
    expect(screen.getByRole('region',{name:'코스 체크포인트'}).textContent).toContain('강변 · 도착');expect(screen.getByLabelText('코스 거리와 획득고도').textContent).toContain('거리3.2 km');
    localStorage.clear();
  });
  it('재선택으로 지점이 100개를 넘으면 원본을 보존한다',()=>{
    render(<Harness initial={{...createSeed().meetings[2]!,...{courseSource:readSegmentCoursePlan([]).source},segments:[],courseCheckpoints:Array.from({length:100},(_,index)=>({name:`수동 ${index}`,source:'manual' as const}))}}/>);
    fireEvent.click(screen.getByRole('button',{name:'첫 구간 추가'}));expect(screen.getByRole('alert').textContent).toContain('100개');expect(result().segments).toHaveLength(0);expect(result().courseCheckpoints).toHaveLength(100);
  });
});
