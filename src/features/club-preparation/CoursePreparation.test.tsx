// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CoursePreparation from './CoursePreparation';
vi.mock('./ClubCourseMap',()=>({default:()=> <div role="region" aria-label="코스 지도와 고도표"/>}));
import CoursePreview from './CoursePreview';
import MeetingForm from './MeetingForm';
import { createSeed, duplicateMeeting, type Meeting } from './domain';
import { latestDraft } from './meetingDrafts';
import { loadSegmentDetail, type SegmentChoice } from './segmentCatalog';
vi.mock('./segmentCatalog',async importOriginal=>({...await importOriginal<typeof import('./segmentCatalog')>(),loadSegmentDetail:vi.fn(async choice=>choice)}));
import { loadCourseCatalog, type SavedCourseChoice } from './courseCatalog';
vi.mock('./courseCatalog',()=>({loadCourseCatalog:vi.fn(),toCoursePlan:(course:SavedCourseChoice)=>({source:{kind:'saved-course',id:course.id,name:course.name},distanceKm:course.distanceKm,elevationGainM:course.elevationGainM,checkpoints:course.checkpoints,track:course.track,segments:[]})}));
const course:SavedCourseChoice={id:'saved-route',name:'기존 강변 코스',description:'강변을 따라 카페에서 쉬어요.',distanceKm:42,elevationGainM:320,checkpoints:[{name:'편의점 보급',source:'course',type:'보급',distanceKm:15,note:'물 채우기'}]};
const gpx='<gpx><metadata><name>가을 GPX</name></metadata><wpt lat="37.005" lon="127.005"><name>중간 카페</name></wpt><trk><trkseg><trkpt lat="37" lon="127"><ele>0</ele></trkpt><trkpt lat="37.005" lon="127.005"><ele>100</ele></trkpt><trkpt lat="37.01" lon="127.01"><ele>200</ele></trkpt><trkpt lat="37.015" lon="127.015"><ele>50</ele></trkpt></trkseg></trk></gpx>';
function Harness({initial}:{initial:Meeting}){const[meeting,setMeeting]=useState(initial);return <><CoursePreparation meeting={meeting} onChange={setMeeting} onBusyChange={vi.fn()}/><output aria-label="현재 전체 거리">{meeting.distanceKm??'미정'}</output><CoursePreview meeting={meeting}/></>;}
beforeEach(()=>{localStorage.clear();vi.mocked(loadSegmentDetail).mockReset().mockImplementation(async choice=>choice);vi.mocked(loadCourseCatalog).mockResolvedValue([course]);});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
const upload=()=>{const file=new File([gpx],'autumn.gpx',{type:'application/gpx+xml'});Object.defineProperty(file,'text',{value:async()=>gpx});fireEvent.change(screen.getByLabelText('코스 GPX 첨부'),{target:{files:[file]}});};
describe('코스부터 준비하는 모집 작성',()=>{
  it('기존 코스를 비교하고 취소하면 원형 유지, 확인하면 통계·체크포인트 자동 적용한다',async()=>{
    const initial={...createSeed().meetings[2]!,courseHighlights:'',courseCheckpoints:[{name:'직접 정한 만남',source:'manual' as const,distanceKm:2}]};
    render(<Harness initial={initial}/>);
    fireEvent.click(screen.getByRole('button',{name:'기존 코스 불러오기'}));
    fireEvent.click(await screen.findByRole('button',{name:'이 코스 가져오기'}));
    expect(screen.getByRole('region',{name:'코스 변경 확인'}).textContent).toContain('기존 강변 코스');
    fireEvent.click(screen.getByRole('button',{name:'변경 취소'}));expect(screen.getByLabelText('현재 전체 거리').textContent).toBe('86');
    fireEvent.click(screen.getByRole('button',{name:'이 코스 가져오기'}));fireEvent.click(screen.getByRole('button',{name:'확인하고 적용'}));
    expect(screen.getByLabelText('현재 전체 거리').textContent).toBe('42');
    expect(screen.getByRole('region',{name:'코스 체크포인트'}).textContent).toContain('편의점 보급');
    expect(screen.getByRole('region',{name:'코스 체크포인트'}).textContent).toContain('직접 정한 만남');
    expect(screen.getByText('강변을 따라 카페에서 쉬어요.')).toBeTruthy();
  });
  it('유효한 GPX 파일에서 실제 모임용 구간을 생성하고 공식 상세 링크를 만들지 않는다',async()=>{
    const initial={...createSeed().meetings[2]!,distanceKm:undefined,elevationGainM:undefined,courseHighlights:'',courseStops:[],courseCheckpoints:[],segments:[]};
    render(<Harness initial={initial}/>);fireEvent.click(screen.getByRole('tab',{name:'GPX로 준비하기'}));upload();
    await waitFor(()=>expect(screen.getByLabelText('현재 전체 거리').textContent).not.toBe('미정'));
    expect(screen.getByText(/이 모임용 생성 구간 2개/)).toBeTruthy();
    expect(screen.getByRole('region',{name:'코스 체크포인트'}).textContent).toContain('중간 카페');
    expect(screen.queryByRole('link',{name:/기존 세그먼트 상세/})).toBeNull();
  });
  it('GPX 출처·체크포인트·생성 구간을 미게시 초안과 미리보기에 보존한다',async()=>{
    const state=createSeed();const initial={...duplicateMeeting(state.meetings[2]!,'gpx-draft'),hostId:'me'};
    const view=render(<MeetingForm state={state} initial={initial} onSave={vi.fn()} onClose={vi.fn()}/>);
    fireEvent.click(screen.getByRole('tab',{name:'GPX로 준비하기'}));upload();
    fireEvent.click(await screen.findByRole('button',{name:'확인하고 적용'}));
    expect(latestDraft().meeting?.courseSource?.kind).toBe('gpx');expect(latestDraft().meeting?.segments).toHaveLength(2);
    view.unmount();render(<MeetingForm state={state} initial={initial} onSave={vi.fn()} onClose={vi.fn()}/>);
    expect(screen.getByText(/이 모임용 생성 구간 2개/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button',{name:'모집글 미리보기'})[0]!);
    expect(screen.getByRole('region',{name:'코스 체크포인트'}).textContent).toContain('중간 카페');
    expect(screen.queryByRole('link',{name:/기존 세그먼트 상세/})).toBeNull();
  });
  it('100개 체크포인트를 가져올 때 수동 지점 보존으로 초과하면 적용을 막는다',async()=>{
    vi.mocked(loadCourseCatalog).mockResolvedValue([{...course,checkpoints:Array.from({length:100},(_,index)=>({name:`가져올 지점 ${index}`,source:'course' as const,distanceKm:index}))}]);
    render(<Harness initial={{...createSeed().meetings[2]!,courseCheckpoints:[{name:'직접 정한 지점',source:'manual'}]}}/>);
    fireEvent.click(screen.getByRole('button',{name:'기존 코스 불러오기'}));fireEvent.click(await screen.findByRole('button',{name:'이 코스 가져오기'}));
    fireEvent.click(screen.getByRole('button',{name:'확인하고 적용'}));
    expect(screen.getByRole('alert').textContent).toContain('100개');expect(screen.getByLabelText('현재 전체 거리').textContent).toBe('86');
    fireEvent.click(screen.getByRole('checkbox',{name:'직접 추가한 체크포인트 유지'}));fireEvent.click(screen.getByRole('button',{name:'확인하고 적용'}));
    expect(screen.getByLabelText('현재 전체 거리').textContent).toBe('42');
  });
  it('GPX 없이 공개 구간을 고르면 선택 구간 거리 합계를 자동 표시한다',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({segments:[{id:'public-route',name:'강변 구간',distance:3200,averageGrade:0}]}),{headers:{'content-type':'application/json'}})));
    render(<Harness initial={{...createSeed().meetings[2]!,distanceKm:undefined,elevationGainM:undefined,courseStops:[],courseCheckpoints:[],segments:[]}}/>);
    fireEvent.click(screen.getByRole('tab',{name:'세그먼트로 준비하기'}));fireEvent.click(screen.getByRole('button',{name:'기존 세그먼트 찾기'}));
    fireEvent.change(screen.getByLabelText('세그먼트 이름·지역 검색'),{target:{value:'강변'}});
    fireEvent.click(await screen.findByRole('button',{name:'구간 선택',exact:true}));
    await waitFor(()=>expect(screen.getByLabelText('현재 전체 거리').textContent).toBe('3.2'));
    expect(screen.getByText(/선택 구간 합계 · 3.2km/)).toBeTruthy();
    expect(screen.getByRole('link',{name:/기존 세그먼트 상세/}).getAttribute('href')).toBe('/ko/segment/public-route');
  });

  it('구간 상세 정보를 가져오는 동안 미리보기를 막고 완료 후 자동 반영한다',async()=>{
    let finish!: (choice:SegmentChoice)=>void;
    vi.mocked(loadSegmentDetail).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({segments:[{id:'public-route',name:'강변 구간',distance:3200}]}),{headers:{'content-type':'application/json'}})));
    const state=createSeed();const initial={...duplicateMeeting(state.meetings[2]!,'busy-segment'),hostId:'me',distanceKm:undefined,elevationGainM:undefined,courseStops:[],courseCheckpoints:[],segments:[]};
    render(<MeetingForm state={state} initial={initial} onSave={vi.fn()} onClose={vi.fn()}/>);
    fireEvent.click(screen.getByRole('tab',{name:'세그먼트로 준비하기'}));fireEvent.click(screen.getByRole('button',{name:'기존 세그먼트 찾기'}));
    fireEvent.change(screen.getByLabelText('세그먼트 이름·지역 검색'),{target:{value:'강변'}});fireEvent.click(await screen.findByRole('button',{name:'구간 선택',exact:true}));
    await waitFor(()=>expect(screen.getAllByRole('button',{name:'모집글 미리보기'}).every(button=>button.hasAttribute('disabled'))).toBe(true));
    finish({id:'public-route',name:'강변 구간',distance:3200,elevationGain:0});
    await waitFor(()=>expect(screen.getAllByRole('button',{name:'모집글 미리보기'}).every(button=>!button.hasAttribute('disabled'))).toBe(true));
    expect(latestDraft().meeting?.distanceKm).toBe(3.2);expect(latestDraft().meeting?.elevationGainM).toBe(0);
  });

  it('코스 교체 전 경로와 주요 구간 삭제를 알리고 취소하면 기존 안내를 보존한다',async()=>{
    const initial={...createSeed().meetings[2]!,courseTrack:{fileName:'old.gpx',distanceKm:86,points:[{lat:37,lon:127},{lat:37.1,lon:127.1}]},segments:[{id:'old-public',name:'기존 구간',source:'public-catalog' as const,mode:'오픈' as const,instruction:'정상에서 만나요.'}]};
    render(<Harness initial={initial}/>);fireEvent.click(screen.getByRole('button',{name:'기존 코스 불러오기'}));fireEvent.click(await screen.findByRole('button',{name:'이 코스 가져오기'}));
    const confirm=screen.getByRole('region',{name:'코스 변경 확인'});
    expect(confirm.textContent).toContain('이전: 경로 있음 / 가져올 경로: 경로 없음');
    expect(confirm.textContent).toContain('기존 1개 → 가져올 구간 0개');
    expect(confirm.textContent).toContain('기존 구간별 진행 방식과 설명도 새 구간 안내로 교체');
    fireEvent.click(screen.getByRole('button',{name:'변경 취소'}));
    expect(screen.getByRole('region',{name:'코스 지도와 고도표'})).toBeTruthy();
    expect(screen.getByRole('link',{name:/기존 세그먼트 상세/})).toBeTruthy();
  });
  it('직접 추가한 체크포인트 이름·유형·거리·메모를 수정한다',()=>{
    render(<Harness initial={{...createSeed().meetings[2]!,courseCheckpoints:[{name:'원래 지점',source:'manual'}]}}/>);
    fireEvent.click(screen.getByText(/체크포인트 확인·수정/,{selector:'summary'}));
    fireEvent.change(screen.getByLabelText('체크포인트 이름'),{target:{value:'카페 재집결'}});
    fireEvent.change(screen.getByLabelText('유형'),{target:{value:'재집결'}});
    fireEvent.change(screen.getByLabelText('출발부터 거리 (km)'),{target:{value:'12.5'}});
    fireEvent.change(screen.getByLabelText('체크포인트 메모'),{target:{value:'입구에서 기다려요.'}});
    const points=screen.getByRole('region',{name:'코스 체크포인트'});
    expect(points.textContent).toContain('카페 재집결');expect(points.textContent).toContain('12.5km');expect(points.textContent).toContain('입구에서 기다려요.');
  });

  it('체크포인트 입력 표시를 읽기 좋게 바꿔도 원본 거리와 유형 코드는 유지한다',()=>{
    const distance=31.264664971566393;const onChange=vi.fn();
    render(<CoursePreparation meeting={{...createSeed().meetings[2]!,courseCheckpoints:[{name:'보급소',source:'course',type:'FOOD',distanceKm:distance}]}} onChange={onChange} onBusyChange={vi.fn()}/>);
    fireEvent.click(screen.getByText(/체크포인트 확인·수정/,{selector:'summary'}));
    expect((screen.getByLabelText('출발부터 거리 (km)') as HTMLInputElement).value).toBe('31.26');
    expect((screen.getByLabelText('유형') as HTMLInputElement).value).toBe('음식·보급');expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('체크포인트 이름'),{target:{value:'편의점 보급'}});
    expect(onChange.mock.calls[0]![0].courseCheckpoints[0]).toMatchObject({type:'FOOD',distanceKm:distance});
  });

  it('기존 코스를 적용한 뒤 목록을 접고 다시 찾을 때 로딩한 목록을 재사용한다',async()=>{
    render(<Harness initial={createSeed().meetings[2]!}/>);
    fireEvent.click(screen.getByRole('button',{name:'기존 코스 불러오기'}));fireEvent.click(await screen.findByRole('button',{name:'이 코스 가져오기'}));
    expect(screen.getByLabelText('기존 코스 이름 검색')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'변경 취소'}));expect(screen.getByRole('button',{name:'이 코스 가져오기'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'이 코스 가져오기'}));fireEvent.click(screen.getByRole('button',{name:'확인하고 적용'}));
    expect(screen.queryByLabelText('기존 코스 이름 검색')).toBeNull();expect(screen.queryByRole('button',{name:'이 코스 가져오기'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'다른 코스 찾기'}));
    expect(screen.getByRole('button',{name:'이 코스 가져오기'})).toBeTruthy();expect(loadCourseCatalog).toHaveBeenCalledTimes(1);
  });

});
